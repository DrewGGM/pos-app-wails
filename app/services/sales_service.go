package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// SalesService handles sales operations
type SalesService struct {
	db         *gorm.DB
	localDB    *database.LocalDB
	orderSvc   *OrderService
	invoiceSvc *InvoiceService
	printerSvc *PrinterService
	productSvc *ProductService
}

// NewSalesService creates a new sales service
func NewSalesService() *SalesService {
	return &SalesService{
		db:         database.GetDB(),
		localDB:    database.GetLocalDB(),
		orderSvc:   NewOrderService(),
		invoiceSvc: NewInvoiceService(),
		printerSvc: NewPrinterService(),
		productSvc: NewProductService(),
	}
}

// ProcessSale processes a sale from an order
func (s *SalesService) ProcessSale(orderID uint, paymentData []PaymentData, customerData *models.Customer, needsElectronicInvoice bool, sendEmailToCustomer bool, employeeID uint, cashRegisterID uint, printReceipt bool) (*models.Sale, error) {
	// LOG: Check if electronic invoice is requested
	fmt.Printf("\n🧾 ========== PROCESSING SALE ==========\n")
	fmt.Printf("Order ID: %d\n", orderID)
	fmt.Printf("Needs Electronic Invoice: %v\n", needsElectronicInvoice)
	fmt.Printf("Print Receipt: %v\n", printReceipt)
	if customerData != nil {
		fmt.Printf("Customer: %s (%s)\n", customerData.Name, customerData.IdentificationNumber)
	} else {
		fmt.Printf("Customer: None\n")
	}
	fmt.Printf("======================================\n\n")

	// Get order with all related data
	order, err := s.orderSvc.GetOrder(orderID)
	if err != nil {
		return nil, fmt.Errorf("order not found: %w", err)
	}

	// Validate order can be processed
	if order.Status == models.OrderStatusPaid {
		return nil, fmt.Errorf("order already paid")
	}
	if order.Status == models.OrderStatusCancelled {
		return nil, fmt.Errorf("order is cancelled")
	}

	// Generate sale number
	saleNumber := s.generateSaleNumber()

	// Create sale
	sale := &models.Sale{
		SaleNumber:     saleNumber,
		OrderID:        orderID,
		Order:          order,
		Subtotal:       order.Subtotal,
		Tax:            order.Tax,
		Discount:       order.Discount,
		Total:          order.Total,
		Status:         "completed",
		InvoiceType:    "none",
		EmployeeID:     employeeID,
		CashRegisterID: cashRegisterID,
		Notes:          order.Notes,
		IsSynced:       false,
	}

	// Set customer if provided, or use default CONSUMIDOR FINAL
	if customerData != nil {
		// Create or update customer
		customer, err := s.createOrUpdateCustomer(customerData)
		if err != nil {
			return nil, fmt.Errorf("failed to process customer: %w", err)
		}
		sale.CustomerID = &customer.ID
		sale.Customer = customer
	} else {
		// No customer provided - use default CONSUMIDOR FINAL
		var defaultCustomer models.Customer
		err := s.db.Where("identification_number = ?", "222222222222").First(&defaultCustomer).Error
		if err == nil {
			sale.CustomerID = &defaultCustomer.ID
			sale.Customer = &defaultCustomer
			fmt.Printf("Using default CONSUMIDOR FINAL customer for sale\n")
		} else {
			fmt.Printf("Warning: Default CONSUMIDOR FINAL customer not found, sale will have no customer\n")
		}
	}

	// Set invoice type and flag
	sale.NeedsElectronicInvoice = needsElectronicInvoice
	if needsElectronicInvoice {
		sale.InvoiceType = "electronic"
	}

	// Check if online or offline
	if s.localDB.IsOfflineMode() {
		// Save locally
		if err := s.localDB.SaveSale(sale, needsElectronicInvoice); err != nil {
			return nil, fmt.Errorf("failed to save sale locally: %w", err)
		}

		// Update order status locally
		order.Status = models.OrderStatusPaid
		s.localDB.SaveOrder(order)

		return sale, nil
	}

	// Process sale in transaction
	err = s.db.Transaction(func(tx *gorm.DB) error {
		// Create sale
		if err := tx.Create(sale).Error; err != nil {
			return fmt.Errorf("failed to create sale: %w", err)
		}

		// Process payments
		for _, payment := range paymentData {
			p := models.Payment{
				SaleID:          sale.ID,
				PaymentMethodID: payment.PaymentMethodID,
				Amount:          payment.Amount,
				Reference:       payment.Reference,
			}
			if err := tx.Create(&p).Error; err != nil {
				return fmt.Errorf("failed to create payment: %w", err)
			}
		}

		// Update order status
		order.Status = models.OrderStatusPaid
		order.SaleID = &sale.ID
		if err := tx.Save(order).Error; err != nil {
			return fmt.Errorf("failed to update order: %w", err)
		}

		// NOTE: Sales are NOT recorded as cash movements
		// Cash movements are only for manual deposits and withdrawals
		// Sales are automatically counted in the cash register report

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Process electronic invoice and print if needed
	if needsElectronicInvoice {
		go func() {
			// Recover from any panics to prevent crashing the application
			defer func() {
				if r := recover(); r != nil {
					fmt.Printf("❌ PANIC recovered in electronic invoice goroutine for sale #%s: %v\n", sale.SaleNumber, r)
					fmt.Printf("⚠️  Please check logs and report this error.\n")
				}
			}()

			fmt.Printf("🧾 Sending electronic invoice for sale #%s...\n", sale.SaleNumber)
			invoice, err := s.invoiceSvc.SendInvoice(sale, sendEmailToCustomer)
			if err != nil {
				// Log error, invoice will be queued for retry
				fmt.Printf("❌ Failed to send electronic invoice for sale #%s: %v\n", sale.SaleNumber, err)
				fmt.Printf("⚠️  Invoice queued for retry. Will not print automatically.\n")
				// DO NOT print simple receipt when electronic invoice was requested
				// User can manually reprint once invoice is sent successfully
			} else {
				// Attach electronic invoice to sale
				sale.ElectronicInvoice = invoice
				if err := s.db.Save(sale).Error; err != nil {
					fmt.Printf("Error saving electronic invoice to sale: %v\n", err)
				}

				fmt.Printf("✅ Electronic invoice created for sale #%s (Status: %s)\n", sale.SaleNumber, invoice.Status)

				// Print electronic invoice after successful creation ONLY if printReceipt is true
				if printReceipt {
					if err := s.printerSvc.PrintReceipt(sale, true); err != nil {
						fmt.Printf("Failed to print electronic invoice for sale #%s: %v\n", sale.SaleNumber, err)
					} else {
						fmt.Printf("🖨️  Electronic invoice printed for sale #%s\n", sale.SaleNumber)
					}
				} else {
					fmt.Printf("🖨️  Electronic invoice printing skipped (user disabled printReceipt)\n")
				}
			}
		}()
	} else {
		// Print simple receipt asynchronously ONLY if printReceipt is true
		if printReceipt {
			go func() {
				// Recover from any panics to prevent crashing the application
				defer func() {
					if r := recover(); r != nil {
						fmt.Printf("❌ PANIC recovered in print receipt goroutine for sale #%s: %v\n", sale.SaleNumber, r)
						fmt.Printf("⚠️  Please check printer configuration and logs.\n")
					}
				}()

				if err := s.printerSvc.PrintReceipt(sale, false); err != nil {
					// Log error but don't fail the sale
					fmt.Printf("Failed to print simple receipt for sale #%s: %v\n", sale.SaleNumber, err)
				} else {
					fmt.Printf("🖨️  Simple receipt printed for sale #%s\n", sale.SaleNumber)
				}
			}()
		} else {
			fmt.Printf("🖨️  Simple receipt printing skipped (user disabled printReceipt)\n")
		}
	}

	return sale, nil
}

// PaymentData represents payment information
type PaymentData struct {
	PaymentMethodID uint    `json:"payment_method_id"`
	Amount          float64 `json:"amount"`
	Reference       string  `json:"reference"`
}

// RefundSale processes a refund for a sale
func (s *SalesService) RefundSale(saleID uint, amount float64, reason string, employeeID uint) error {
	var sale models.Sale
	if err := s.db.First(&sale, saleID).Error; err != nil {
		return fmt.Errorf("sale not found: %w", err)
	}

	if sale.Status == "refunded" {
		return fmt.Errorf("sale already refunded")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// Update sale status
		if amount >= sale.Total {
			sale.Status = "refunded"
		} else {
			sale.Status = "partial_refund"
		}
		sale.Notes = fmt.Sprintf("Refund: %s", reason)

		if err := tx.Save(&sale).Error; err != nil {
			return err
		}

		// Return inventory
		var order models.Order
		if err := tx.Preload("Items").First(&order, sale.OrderID).Error; err != nil {
			return err
		}

		for _, item := range order.Items {
			s.productSvc.AdjustStock(item.ProductID, item.Quantity,
				fmt.Sprintf("Refund - Sale %s", sale.SaleNumber), employeeID)
		}

		// Record cash movement (negative)
		if sale.CashRegisterID > 0 {
			s.recordCashMovement(tx, sale.CashRegisterID, -amount, "refund",
				sale.SaleNumber, employeeID)
		}

		return nil
	})
}

// GetSale gets a sale by ID
func (s *SalesService) GetSale(id uint) (*models.Sale, error) {
	var sale models.Sale

	err := s.db.Preload("Order.Items.Product").
		Preload("Customer").
		Preload("Employee").
		Preload("PaymentDetails.PaymentMethod").
		Preload("ElectronicInvoice").
		First(&sale, id).Error

	return &sale, err
}

// GetSaleByNumber gets a sale by sale number
func (s *SalesService) GetSaleByNumber(saleNumber string) (*models.Sale, error) {
	var sale models.Sale

	err := s.db.Preload("Order.Items.Product").
		Preload("Customer").
		Preload("PaymentDetails.PaymentMethod").
		Where("sale_number = ?", saleNumber).
		First(&sale).Error

	return &sale, err
}

// GetTodaySales gets all sales from today
func (s *SalesService) GetTodaySales() ([]models.Sale, error) {
	var sales []models.Sale

	today := time.Now().Format("2006-01-02")

	// Check if offline
	if s.localDB.IsOfflineMode() {
		return s.getLocalTodaySales(today)
	}

	err := s.db.Preload("Customer").
		Preload("Employee").
		Preload("Order.Items.Product").
		Preload("PaymentDetails.PaymentMethod").
		Where("DATE(created_at) = ?", today).
		Order("created_at DESC").
		Find(&sales).Error

	return sales, err
}

// GetSalesByDateRange gets sales within a date range
func (s *SalesService) GetSalesByDateRange(startDate, endDate time.Time) ([]models.Sale, error) {
	var sales []models.Sale

	err := s.db.Preload("Customer").
		Preload("Employee").
		Preload("Order.Items.Product").
		Preload("PaymentDetails.PaymentMethod").
		Where("created_at BETWEEN ? AND ?", startDate, endDate).
		Order("created_at DESC").
		Find(&sales).Error

	return sales, err
}

// GetSalesReport gets sales report with totals
func (s *SalesService) GetSalesReport(startDate, endDate string) (map[string]interface{}, error) {
	var sales []models.Sale

	query := s.db.Preload("PaymentDetails.PaymentMethod")

	if startDate != "" && endDate != "" {
		start, _ := time.Parse("2006-01-02", startDate)
		end, _ := time.Parse("2006-01-02", endDate)
		query = query.Where("created_at BETWEEN ? AND ?", start, end.Add(24*time.Hour))
	}

	if err := query.Find(&sales).Error; err != nil {
		return nil, err
	}

	// Calculate totals
	var totalSales, totalCash, totalCard, totalDigital, totalTax, totalDiscount float64
	var count int

	for _, sale := range sales {
		totalSales += sale.Total
		totalTax += sale.Tax
		totalDiscount += sale.Discount
		count++

		for _, payment := range sale.PaymentDetails {
			switch payment.PaymentMethod.Type {
			case "cash":
				totalCash += payment.Amount
			case "card":
				totalCard += payment.Amount
			case "digital":
				totalDigital += payment.Amount
			}
		}
	}

	report := map[string]interface{}{
		"sales":          sales,
		"total_sales":    totalSales,
		"total_cash":     totalCash,
		"total_card":     totalCard,
		"total_digital":  totalDigital,
		"total_tax":      totalTax,
		"total_discount": totalDiscount,
		"count":          count,
		"start_date":     startDate,
		"end_date":       endDate,
	}

	return report, nil
}

// GetSalesHistory gets sales history with pagination
func (s *SalesService) GetSalesHistory(limit, offset int) (map[string]interface{}, error) {
	var sales []models.Sale
	var total int64

	// Count total
	s.db.Model(&models.Sale{}).Count(&total)

	// Get paginated results
	err := s.db.Preload("Customer").
		Preload("Employee").
		Preload("ElectronicInvoice").
		Preload("Order.Items.Product").
		Preload("PaymentDetails.PaymentMethod").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&sales).Error

	if err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"sales": sales,
		"total": total,
	}

	return result, nil
}

// ResendElectronicInvoice resends an electronic invoice for a sale
func (s *SalesService) ResendElectronicInvoice(saleID uint) error {
	sale, err := s.GetSale(saleID)
	if err != nil {
		return err
	}

	// Check if already has electronic invoice
	if sale.ElectronicInvoice != nil && sale.ElectronicInvoice.Status == "accepted" {
		return fmt.Errorf("sale already has a valid electronic invoice")
	}

	// Send invoice (default to true when resending - send email)
	invoice, err := s.invoiceSvc.SendInvoice(sale, true)
	if err != nil {
		return fmt.Errorf("failed to send electronic invoice: %w", err)
	}

	// Update sale
	sale.InvoiceType = "electronic"
	sale.ElectronicInvoice = invoice
	s.db.Save(sale)

	return nil
}

// Customer management

func (s *SalesService) createOrUpdateCustomer(customerData *models.Customer) (*models.Customer, error) {
	var customer models.Customer

	// Try to find existing customer
	err := s.db.Where("identification_number = ?", customerData.IdentificationNumber).First(&customer).Error

	if err == gorm.ErrRecordNotFound {
		// Create new customer
		customer = *customerData
		if err := s.db.Create(&customer).Error; err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	} else {
		// Update existing customer
		customer.Name = customerData.Name
		customer.Email = customerData.Email
		customer.Phone = customerData.Phone
		customer.Address = customerData.Address
		if err := s.db.Save(&customer).Error; err != nil {
			return nil, err
		}
	}

	// Cache customer locally
	s.cacheCustomer(&customer)

	return &customer, nil
}

// GetCustomers gets all customers
func (s *SalesService) GetCustomers() ([]models.Customer, error) {
	var customers []models.Customer

	// Try main database first
	if !s.localDB.IsOfflineMode() {
		err := s.db.Where("is_active = ?", true).
			Order("name").
			Find(&customers).Error

		if err == nil {
			// Cache customers
			for _, customer := range customers {
				s.cacheCustomer(&customer)
			}
			return customers, nil
		}
	}

	// Fallback to local cache
	return s.getCustomersFromCache()
}

// SearchCustomers searches customers by name or identification
func (s *SalesService) SearchCustomers(query string) ([]models.Customer, error) {
	var customers []models.Customer

	searchQuery := "%" + query + "%"
	err := s.db.Where("(name LIKE ? OR identification_number LIKE ?) AND is_active = ?",
		searchQuery, searchQuery, true).
		Find(&customers).Error

	return customers, err
}

// CreateCustomer creates a new customer
func (s *SalesService) CreateCustomer(customer *models.Customer) error {
	if err := s.db.Create(customer).Error; err != nil {
		return err
	}
	s.cacheCustomer(customer)
	return nil
}

// UpdateCustomer updates a customer
func (s *SalesService) UpdateCustomer(customer *models.Customer) error {
	if err := s.db.Save(customer).Error; err != nil {
		return err
	}
	s.cacheCustomer(customer)
	return nil
}

// DeleteCustomer soft deletes a customer
func (s *SalesService) DeleteCustomer(id uint) error {
	return s.db.Delete(&models.Customer{}, id).Error
}

// GetCustomer gets a customer by ID
func (s *SalesService) GetCustomer(id uint) (*models.Customer, error) {
	var customer models.Customer
	err := s.db.First(&customer, id).Error
	return &customer, err
}

// Helper methods

func (s *SalesService) generateSaleNumber() string {
	timestamp := time.Now().Format("20060102150405")
	return fmt.Sprintf("SALE-%s", timestamp)
}

func (s *SalesService) recordCashMovement(tx *gorm.DB, cashRegisterID uint, amount float64, movementType, reference string, employeeID uint) error {
	description := fmt.Sprintf("%s - %s", movementType, reference)
	movement := models.CashMovement{
		CashRegisterID: cashRegisterID,
		Type:           movementType,
		Amount:         amount,
		Description:    description,
		Reason:         description, // Use same description for reason
		Reference:      reference,
		EmployeeID:     employeeID,
	}

	return tx.Create(&movement).Error
}

func (s *SalesService) getLocalTodaySales(today string) ([]models.Sale, error) {
	var localSales []database.LocalSale
	if err := s.localDB.GetDB().Where("DATE(created_at) = ?", today).Find(&localSales).Error; err != nil {
		return nil, err
	}

	var sales []models.Sale
	for _, ls := range localSales {
		var sale models.Sale
		if err := json.Unmarshal([]byte(ls.SaleData), &sale); err != nil {
			continue
		}
		sales = append(sales, sale)
	}

	return sales, nil
}

func (s *SalesService) cacheCustomer(customer *models.Customer) {
	if s.localDB == nil {
		return
	}

	customerData, _ := json.Marshal(customer)
	localCustomer := database.LocalCustomer{
		ID:                   customer.ID,
		IdentificationNumber: customer.IdentificationNumber,
		CustomerData:         string(customerData),
		LastSynced:           time.Now(),
	}

	s.localDB.GetDB().Save(&localCustomer)
}

func (s *SalesService) getCustomersFromCache() ([]models.Customer, error) {
	var localCustomers []database.LocalCustomer
	if err := s.localDB.GetDB().Find(&localCustomers).Error; err != nil {
		return nil, err
	}

	var customers []models.Customer
	for _, lc := range localCustomers {
		var customer models.Customer
		if err := json.Unmarshal([]byte(lc.CustomerData), &customer); err != nil {
			continue
		}
		customers = append(customers, customer)
	}

	return customers, nil
}

// GetPaymentMethods gets all active payment methods
func (s *SalesService) GetPaymentMethods() ([]models.PaymentMethod, error) {
	var methods []models.PaymentMethod

	// Try main database first
	if !s.localDB.IsOfflineMode() {
		err := s.db.Where("is_active = ?", true).
			Order("display_order").
			Find(&methods).Error

		if err == nil {
			// Cache payment methods
			s.cachePaymentMethods(methods)
			return methods, nil
		}
	}

	// Fallback to local cache
	return s.getPaymentMethodsFromCache()
}

func (s *SalesService) cachePaymentMethods(methods []models.PaymentMethod) {
	if s.localDB == nil {
		return
	}

	for _, method := range methods {
		methodData, _ := json.Marshal(method)
		localMethod := database.LocalPaymentMethod{
			ID:                method.ID,
			PaymentMethodData: string(methodData),
			LastSynced:        time.Now(),
		}

		s.localDB.GetDB().Save(&localMethod)
	}
}

func (s *SalesService) getPaymentMethodsFromCache() ([]models.PaymentMethod, error) {
	var localMethods []database.LocalPaymentMethod
	if err := s.localDB.GetDB().Find(&localMethods).Error; err != nil {
		return nil, err
	}

	var methods []models.PaymentMethod
	for _, lm := range localMethods {
		var method models.PaymentMethod
		if err := json.Unmarshal([]byte(lm.PaymentMethodData), &method); err != nil {
			continue
		}
		methods = append(methods, method)
	}

	return methods, nil
}

// CreatePaymentMethod creates a new payment method
func (s *SalesService) CreatePaymentMethod(method *models.PaymentMethod) error {
	if err := s.db.Create(method).Error; err != nil {
		return err
	}
	s.cachePaymentMethods([]models.PaymentMethod{*method})
	return nil
}

// UpdatePaymentMethod updates a payment method
func (s *SalesService) UpdatePaymentMethod(method *models.PaymentMethod) error {
	if err := s.db.Save(method).Error; err != nil {
		return err
	}
	s.cachePaymentMethods([]models.PaymentMethod{*method})
	return nil
}

// DeletePaymentMethod soft deletes a payment method
func (s *SalesService) DeletePaymentMethod(id uint) error {
	return s.db.Delete(&models.PaymentMethod{}, id).Error
}

// PrintReceipt prints a receipt for an existing sale
func (s *SalesService) PrintReceipt(saleID uint) error {
	return s.PrintReceiptWithPrinter(saleID, 0) // 0 means use default printer
}

// PrintReceiptWithPrinter prints a receipt to a specific printer (0 = default)
func (s *SalesService) PrintReceiptWithPrinter(saleID uint, printerID uint) error {
	// Get sale with all related data
	var sale models.Sale
	err := s.db.Preload("Order.Items.Product").
		Preload("Order.Items.Modifiers.Modifier").
		Preload("Order.Table").
		Preload("Order.Customer").
		Preload("Customer").
		Preload("Employee").
		Preload("PaymentDetails.PaymentMethod").
		Preload("ElectronicInvoice").
		First(&sale, saleID).Error

	if err != nil {
		return fmt.Errorf("sale not found: %w", err)
	}

	// Determine if it's an electronic invoice based on the flag, not just presence of invoice object
	// This ensures we print the electronic format when requested, even if invoice is still processing
	isElectronicInvoice := sale.NeedsElectronicInvoice && sale.ElectronicInvoice != nil

	// If electronic invoice was requested but not yet created, return error
	if sale.NeedsElectronicInvoice && sale.ElectronicInvoice == nil {
		return fmt.Errorf("factura electrónica aún no está lista - intente nuevamente en unos segundos")
	}

	// Print receipt with specific printer
	if printerID > 0 {
		return s.printerSvc.PrintReceiptWithPrinter(&sale, isElectronicInvoice, printerID)
	}
	return s.printerSvc.PrintReceipt(&sale, isElectronicInvoice)
}
