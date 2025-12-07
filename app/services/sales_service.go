package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"fmt"
	"log"
	"math"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SalesService handles sales operations
type SalesService struct {
	db            *gorm.DB
	orderSvc      *OrderService
	invoiceSvc    *InvoiceService
	printerSvc    *PrinterService
	productSvc    *ProductService
	ingredientSvc *IngredientService
}

// NewSalesService creates a new sales service
func NewSalesService() *SalesService {
	return &SalesService{
		db:            database.GetDB(),
		orderSvc:      NewOrderService(),
		invoiceSvc:    NewInvoiceService(),
		printerSvc:    NewPrinterService(),
		productSvc:    NewProductService(),
		ingredientSvc: NewIngredientService(),
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

	// LOG: Verify order has OrderType loaded
	fmt.Printf("📋 Order retrieved for sale:\n")
	fmt.Printf("   OrderTypeID: %v\n", order.OrderTypeID)
	if order.OrderType != nil {
		fmt.Printf("   OrderType.Name: %s\n", order.OrderType.Name)
		fmt.Printf("   OrderType.Code: %s\n", order.OrderType.Code)
	} else {
		fmt.Printf("   OrderType: nil\n")
	}
	fmt.Printf("   Type (deprecated): %s\n\n", order.Type)

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

	// Validate customer for electronic invoice (DIAN Resolución 0165 de 2023)
	// CONSUMIDOR FINAL (222222222222) is allowed - email is sourced from DefaultConsumerEmail or company email
	if needsElectronicInvoice {
		if sale.Customer == nil {
			return nil, fmt.Errorf("electronic invoice requires a valid customer")
		}
		// Validate customer has required fields for DIAN
		if sale.Customer.IdentificationNumber == "" {
			return nil, fmt.Errorf("customer identification number is required for electronic invoice")
		}
		if sale.Customer.Name == "" {
			return nil, fmt.Errorf("customer name is required for electronic invoice")
		}
	}

	// CRITICAL: Validate payment data BEFORE creating sale
	totalPaymentAmount := 0.0
	for _, payment := range paymentData {
		// Validate positive amount
		if payment.Amount <= 0 {
			return nil, fmt.Errorf("payment amount must be greater than 0")
		}

		// CRITICAL FIX: Validate payment method exists and is active
		var paymentMethod models.PaymentMethod
		if err := s.db.First(&paymentMethod, payment.PaymentMethodID).Error; err != nil {
			return nil, fmt.Errorf("payment method ID %d not found", payment.PaymentMethodID)
		}
		if !paymentMethod.IsActive {
			return nil, fmt.Errorf("payment method '%s' is not active", paymentMethod.Name)
		}

		totalPaymentAmount += payment.Amount
	}

	// Ensure payments match sale total
	// CRITICAL FIX: Allow 1 peso difference to handle rounding issues
	// Round both amounts to handle floating-point precision and Colombian Peso (no decimals)
	roundedPaymentTotal := math.Round(totalPaymentAmount)
	roundedSaleTotal := math.Round(sale.Total)
	difference := math.Abs(roundedPaymentTotal - roundedSaleTotal)

	// Allow up to 1 peso difference due to rounding
	if difference > 1 {
		return nil, fmt.Errorf(
			"payment total ($%.0f) does not match sale total ($%.0f) - difference: $%.2f (allowed: $1)",
			roundedPaymentTotal, roundedSaleTotal, difference,
		)
	}

	// Process sale in transaction
	err = s.db.Transaction(func(tx *gorm.DB) error {
		// CRITICAL FIX: Lock order row and re-check status to prevent race condition
		// This prevents double payment if two requests arrive simultaneously
		var lockedOrder models.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedOrder, orderID).Error; err != nil {
			return fmt.Errorf("failed to lock order: %w", err)
		}

		// Re-validate order status within transaction with lock
		if lockedOrder.Status == models.OrderStatusPaid {
			return fmt.Errorf("order already paid (locked check)")
		}
		if lockedOrder.Status == models.OrderStatusCancelled {
			return fmt.Errorf("order is cancelled (locked check)")
		}

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

		// CRITICAL FIX: Free the table when order is paid
		if order.TableID != nil {
			if err := tx.Model(&models.Table{}).
				Where("id = ?", *order.TableID).
				Update("status", "available").Error; err != nil {
				log.Printf("Warning: Failed to free table %d: %v", *order.TableID, err)
			}
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

		// CRITICAL FIX: Restore product inventory within transaction
		for _, item := range order.Items {
			if err := s.productSvc.AdjustStockInTransaction(tx, item.ProductID, item.Quantity,
				fmt.Sprintf("Refund - Sale %s", sale.SaleNumber), employeeID); err != nil {
				log.Printf("Warning: Failed to adjust stock for product %d: %v", item.ProductID, err)
				// Continue even if stock adjustment fails
			}
		}

		// CRITICAL FIX: Restore ingredient stocks
		// Previously this was missing, causing ingredient stock inconsistency
		if err := s.ingredientSvc.RestoreIngredientsInTransaction(tx, order.Items); err != nil {
			log.Printf("Warning: Failed to restore ingredients for refunded sale %s: %v", sale.SaleNumber, err)
			// Continue despite error - don't fail the refund
		}

		// Record cash movement (negative)
		if sale.CashRegisterID > 0 {
			s.recordCashMovement(tx, sale.CashRegisterID, -amount, "refund",
				sale.SaleNumber, employeeID)
		}

		return nil
	})
}

// DeleteSale deletes a sale and all related data (cascade)
func (s *SalesService) DeleteSale(saleID uint, employeeID uint) error {
	var sale models.Sale
	if err := s.db.Preload("Order.Items").
		Preload("PaymentDetails").
		Preload("ElectronicInvoice").
		First(&sale, saleID).Error; err != nil {
		return fmt.Errorf("sale not found: %w", err)
	}

	log.Printf("DeleteSale: Deleting sale ID=%d, SaleNumber=%s", saleID, sale.SaleNumber)

	return s.db.Transaction(func(tx *gorm.DB) error {
		// 1. Return inventory if the sale was completed
		if sale.Status == "completed" && sale.Order != nil {
			for _, item := range sale.Order.Items {
				if err := s.productSvc.AdjustStockInTransaction(tx, item.ProductID, item.Quantity,
					fmt.Sprintf("Sale deletion - Sale %s", sale.SaleNumber), employeeID); err != nil {
					log.Printf("Warning: Failed to adjust stock for product %d: %v", item.ProductID, err)
					// Continue even if stock adjustment fails
				}
			}

			// CRITICAL FIX: Restore ingredients for the deleted sale
			if err := s.ingredientSvc.RestoreIngredientsInTransaction(tx, sale.Order.Items); err != nil {
				log.Printf("Warning: Failed to restore ingredients for deleted sale %s: %v", sale.SaleNumber, err)
			}
		}

		// 2. Delete cash movements related to this sale
		if sale.CashRegisterID > 0 {
			if err := tx.Where("cash_register_id = ? AND reference = ?", sale.CashRegisterID, sale.SaleNumber).
				Delete(&models.CashMovement{}).Error; err != nil {
				log.Printf("Warning: Failed to delete cash movements: %v", err)
				// Continue even if cash movement deletion fails
			}
		}

		// 3. Delete electronic invoice if exists (cascade will delete it, but being explicit)
		if sale.ElectronicInvoice != nil {
			if err := tx.Delete(&sale.ElectronicInvoice).Error; err != nil {
				return fmt.Errorf("failed to delete electronic invoice: %w", err)
			}
		}

		// 4. Delete payment details (should cascade, but being explicit)
		if err := tx.Where("sale_id = ?", saleID).Delete(&models.Payment{}).Error; err != nil {
			return fmt.Errorf("failed to delete payment details: %w", err)
		}

		// 5. Delete the order and its items (cascade)
		if sale.Order != nil {
			// Delete order item modifiers first
			if err := tx.Where("order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)", sale.OrderID).
				Delete(&models.OrderItemModifier{}).Error; err != nil {
				return fmt.Errorf("failed to delete order item modifiers: %w", err)
			}

			// Delete order items
			if err := tx.Where("order_id = ?", sale.OrderID).Delete(&models.OrderItem{}).Error; err != nil {
				return fmt.Errorf("failed to delete order items: %w", err)
			}

			// Delete the order
			if err := tx.Delete(&models.Order{}, sale.OrderID).Error; err != nil {
				return fmt.Errorf("failed to delete order: %w", err)
			}
		}

		// 6. Finally, delete the sale
		if err := tx.Delete(&sale).Error; err != nil {
			return fmt.Errorf("failed to delete sale: %w", err)
		}

		return nil
	})
}

// GetSale gets a sale by ID
func (s *SalesService) GetSale(id uint) (*models.Sale, error) {
	var sale models.Sale

	// IMPORTANT: Load relationships in hierarchical order
	err := s.db.Preload("Order").                             // Load Order first
		Preload("Order.Items").                       // Then load Items
		Preload("Order.Items.Product").               // Then load Product for each Item
		Preload("Order.Items.Modifiers").             // Load Modifiers
		Preload("Order.Items.Modifiers.Modifier").    // Load Modifier details
		Preload("Order.Table").
		Preload("Order.OrderType").
		Preload("Customer").
		Preload("Employee").
		Preload("PaymentDetails").                    // Load PaymentDetails first
		Preload("PaymentDetails.PaymentMethod").      // Then load PaymentMethod
		Preload("ElectronicInvoice").
		First(&sale, id).Error

	return &sale, err
}

// GetSaleByNumber gets a sale by sale number
func (s *SalesService) GetSaleByNumber(saleNumber string) (*models.Sale, error) {
	var sale models.Sale

	// IMPORTANT: Load relationships in hierarchical order
	err := s.db.Preload("Order").                             // Load Order first
		Preload("Order.Items").                       // Then load Items
		Preload("Order.Items.Product").               // Then load Product for each Item
		Preload("Order.Items.Modifiers").             // Load Modifiers
		Preload("Order.Items.Modifiers.Modifier").    // Load Modifier details
		Preload("Order.Table").
		Preload("Order.OrderType").
		Preload("Customer").
		Preload("Employee").
		Preload("PaymentDetails").                    // Load PaymentDetails first
		Preload("PaymentDetails.PaymentMethod").      // Then load PaymentMethod
		Preload("ElectronicInvoice").
		Where("sale_number = ?", saleNumber).
		First(&sale).Error

	return &sale, err
}

// GetTodaySales gets all sales from today
func (s *SalesService) GetTodaySales() ([]models.Sale, error) {
	var sales []models.Sale

	today := time.Now().Format("2006-01-02")

	// IMPORTANT: Load relationships in hierarchical order
	err := s.db.Preload("Customer").
		Preload("Employee").
		Preload("Order").                             // Load Order first
		Preload("Order.Items").                       // Then load Items
		Preload("Order.Items.Product").               // Then load Product for each Item
		Preload("Order.Items.Modifiers").             // Load Modifiers
		Preload("Order.Items.Modifiers.Modifier").    // Load Modifier details
		Preload("Order.Table").
		Preload("Order.OrderType").
		Preload("PaymentDetails").                    // Load PaymentDetails first
		Preload("PaymentDetails.PaymentMethod").      // Then load PaymentMethod
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
		Preload("Order.Items.Modifiers.Modifier").
		Preload("Order.Table").
		Preload("Order.OrderType").
		Preload("PaymentDetails.PaymentMethod").
		Where("created_at BETWEEN ? AND ?", startDate, endDate).
		Order("created_at DESC").
		Find(&sales).Error

	// DEBUG: Log payment method data to identify affects_cash_register issue
	if len(sales) > 0 && len(sales[0].PaymentDetails) > 0 {
		log.Printf("=== BACKEND PAYMENT METHOD DEBUG ===")
		for _, detail := range sales[0].PaymentDetails {
			if detail.PaymentMethod != nil {
				log.Printf("Payment Method ID: %d", detail.PaymentMethod.ID)
				log.Printf("Payment Method Name: %s", detail.PaymentMethod.Name)
				log.Printf("Payment Method Type: %s", detail.PaymentMethod.Type)
				log.Printf("AffectsCashRegister: %v (type: %T)", detail.PaymentMethod.AffectsCashRegister, detail.PaymentMethod.AffectsCashRegister)
				log.Printf("ShowInCashSummary: %v", detail.PaymentMethod.ShowInCashSummary)
			}
		}
		log.Printf("====================================")
	}

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
	// IMPORTANT: Load relationships in hierarchical order
	err := s.db.Preload("Customer").
		Preload("Employee").
		Preload("ElectronicInvoice").
		Preload("Order").                             // Load Order first
		Preload("Order.Items").                       // Then load Items
		Preload("Order.Items.Product").               // Then load Product for each Item
		Preload("Order.Items.Modifiers").             // Load Modifiers
		Preload("Order.Items.Modifiers.Modifier").    // Load Modifier details
		Preload("Order.Table").
		Preload("Order.OrderType").
		Preload("PaymentDetails").                    // Load PaymentDetails first
		Preload("PaymentDetails.PaymentMethod").      // Then load PaymentMethod
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

	// Check if already has electronic invoice that was accepted
	if sale.ElectronicInvoice != nil && sale.ElectronicInvoice.Status == "accepted" {
		return fmt.Errorf("sale already has a valid electronic invoice")
	}

	// Delete existing failed electronic invoice record to avoid duplicates
	// This also ensures a fresh consecutive number will be used
	if sale.ElectronicInvoice != nil && sale.ElectronicInvoice.ID > 0 {
		s.db.Delete(&models.ElectronicInvoice{}, sale.ElectronicInvoice.ID)
		sale.ElectronicInvoice = nil
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

// ConvertToElectronicInvoice converts a N/A sale to electronic invoice
func (s *SalesService) ConvertToElectronicInvoice(saleID uint) error {
	sale, err := s.GetSale(saleID)
	if err != nil {
		return err
	}

	// Check if already has electronic invoice
	if sale.ElectronicInvoice != nil && sale.ElectronicInvoice.Status == "accepted" {
		return fmt.Errorf("sale already has a valid electronic invoice")
	}

	// Mark sale as needing electronic invoice
	sale.NeedsElectronicInvoice = true
	if err := s.db.Save(sale).Error; err != nil {
		return fmt.Errorf("failed to update sale: %w", err)
	}

	// Send invoice
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

	return &customer, nil
}

// GetCustomers gets all customers
func (s *SalesService) GetCustomers() ([]models.Customer, error) {
	var customers []models.Customer

	err := s.db.Where("is_active = ?", true).
		Order("name").
		Find(&customers).Error

	return customers, err
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
	return s.db.Create(customer).Error
}

// UpdateCustomer updates a customer
func (s *SalesService) UpdateCustomer(customer *models.Customer) error {
	return s.db.Save(customer).Error
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

// GetPaymentMethods gets all active payment methods
func (s *SalesService) GetPaymentMethods() ([]models.PaymentMethod, error) {
	var methods []models.PaymentMethod

	err := s.db.Where("is_active = ?", true).
		Order("display_order").
		Find(&methods).Error

	return methods, err
}

// GetAllPaymentMethods gets all payment methods including inactive ones (for settings management)
func (s *SalesService) GetAllPaymentMethods() ([]models.PaymentMethod, error) {
	var methods []models.PaymentMethod

	err := s.db.Order("display_order").Find(&methods).Error

	return methods, err
}

// CreatePaymentMethod creates a new payment method
func (s *SalesService) CreatePaymentMethod(method *models.PaymentMethod) error {
	return s.db.Create(method).Error
}

// UpdatePaymentMethod updates a payment method
func (s *SalesService) UpdatePaymentMethod(method *models.PaymentMethod) error {
	return s.db.Save(method).Error
}

// GetPaymentMethodSalesCount returns the number of sales associated with a payment method
func (s *SalesService) GetPaymentMethodSalesCount(id uint) (int64, error) {
	var payments []models.Payment
	if err := s.db.Where("payment_method_id = ?", id).Find(&payments).Error; err != nil {
		return 0, err
	}

	// Extract unique sale IDs
	saleIDs := make(map[uint]bool)
	for _, payment := range payments {
		saleIDs[payment.SaleID] = true
	}

	return int64(len(saleIDs)), nil
}

// DeletePaymentMethod deletes a payment method and all associated sales in cascade
// CRITICAL FIX: This function was EXTREMELY DESTRUCTIVE - it deleted all sales using the payment method
// New implementation: Validates and rejects deletion if there are any associated payments
func (s *SalesService) DeletePaymentMethod(id uint) error {
	// Get the payment method to check if it's a system default
	var paymentMethod models.PaymentMethod
	if err := s.db.First(&paymentMethod, id).Error; err != nil {
		return fmt.Errorf("payment method not found: %w", err)
	}

	// SAFETY CHECK 1: Cannot delete system default payment methods
	if paymentMethod.IsSystemDefault {
		return fmt.Errorf("cannot delete system default payment method '%s'", paymentMethod.Name)
	}

	// SAFETY CHECK 2: Check if there are any payments using this payment method
	var paymentCount int64
	if err := s.db.Model(&models.Payment{}).Where("payment_method_id = ?", id).Count(&paymentCount).Error; err != nil {
		return fmt.Errorf("failed to check payment usage: %w", err)
	}

	if paymentCount > 0 {
		return fmt.Errorf("cannot delete payment method '%s': it is used in %d payment(s). Consider marking it as inactive instead",
			paymentMethod.Name, paymentCount)
	}

	// Safe to delete - no payments are using this method
	if err := s.db.Delete(&models.PaymentMethod{}, id).Error; err != nil {
		return fmt.Errorf("failed to delete payment method: %w", err)
	}

	log.Printf("DeletePaymentMethod: Successfully deleted payment method ID=%d, Name=%s", id, paymentMethod.Name)
	return nil
}

// DeactivatePaymentMethod marks a payment method as inactive instead of deleting it
// This is the recommended approach for payment methods that have been used in sales
func (s *SalesService) DeactivatePaymentMethod(id uint) error {
	var paymentMethod models.PaymentMethod
	if err := s.db.First(&paymentMethod, id).Error; err != nil {
		return fmt.Errorf("payment method not found: %w", err)
	}

	if paymentMethod.IsSystemDefault {
		return fmt.Errorf("cannot deactivate system default payment method '%s'", paymentMethod.Name)
	}

	paymentMethod.IsActive = false
	if err := s.db.Save(&paymentMethod).Error; err != nil {
		return fmt.Errorf("failed to deactivate payment method: %w", err)
	}

	log.Printf("DeactivatePaymentMethod: Deactivated payment method ID=%d, Name=%s", id, paymentMethod.Name)
	return nil
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

// ==================== DIAN CLOSING REPORT ====================

// DIANClosingReport represents the daily DIAN closing report
type DIANClosingReport struct {
	// Business Info
	BusinessName       string `json:"business_name"`
	CommercialName     string `json:"commercial_name"`
	NIT                string `json:"nit"`
	DV                 string `json:"dv"`
	Regime             string `json:"regime"`
	Liability          string `json:"liability"`
	Address            string `json:"address"`
	City               string `json:"city"`
	Department         string `json:"department"`
	Phone              string `json:"phone"`
	Email              string `json:"email"`
	Resolution         string `json:"resolution"`
	ResolutionPrefix   string `json:"resolution_prefix"`
	ResolutionFrom     int    `json:"resolution_from"`
	ResolutionTo       int    `json:"resolution_to"`
	ResolutionDateFrom string `json:"resolution_date_from"`
	ResolutionDateTo   string `json:"resolution_date_to"`

	// Report Info
	ReportDate  string    `json:"report_date"`
	GeneratedAt time.Time `json:"generated_at"`

	// Invoice Range
	FirstInvoiceNumber string `json:"first_invoice_number"`
	LastInvoiceNumber  string `json:"last_invoice_number"`
	TotalInvoices      int    `json:"total_invoices"`

	// Sales by Category
	SalesByCategory []CategorySalesDetail `json:"sales_by_category"`

	// Sales by Tax Type
	SalesByTax []TaxBreakdownDetail `json:"sales_by_tax"`

	// Adjustments (Credit/Debit Notes)
	CreditNotes      []NoteDetail `json:"credit_notes"`
	DebitNotes       []NoteDetail `json:"debit_notes"`
	TotalCreditNotes float64      `json:"total_credit_notes"`
	TotalDebitNotes  float64      `json:"total_debit_notes"`

	// Payment Methods
	PaymentMethods []PaymentMethodSummary `json:"payment_methods"`

	// Totals
	TotalTransactions int     `json:"total_transactions"`
	TotalSubtotal     float64 `json:"total_subtotal"`
	TotalTax          float64 `json:"total_tax"`
	TotalDiscount     float64 `json:"total_discount"`
	TotalSales        float64 `json:"total_sales"`
	TotalAdjustments  float64 `json:"total_adjustments"`
	GrandTotal        float64 `json:"grand_total"`
}

// CategorySalesDetail represents sales breakdown by category
type CategorySalesDetail struct {
	CategoryID   uint    `json:"category_id"`
	CategoryName string  `json:"category_name"`
	Quantity     int     `json:"quantity"`
	Subtotal     float64 `json:"subtotal"`
	Tax          float64 `json:"tax"`
	Total        float64 `json:"total"`
}

// TaxBreakdownDetail represents sales breakdown by tax type
type TaxBreakdownDetail struct {
	TaxTypeID   int     `json:"tax_type_id"`
	TaxTypeName string  `json:"tax_type_name"`
	TaxPercent  float64 `json:"tax_percent"`
	BaseAmount  float64 `json:"base_amount"`
	TaxAmount   float64 `json:"tax_amount"`
	Total       float64 `json:"total"`
	ItemCount   int     `json:"item_count"`
}

// NoteDetail represents credit/debit note detail
type NoteDetail struct {
	Number    string    `json:"number"`
	Prefix    string    `json:"prefix"`
	Reason    string    `json:"reason"`
	Amount    float64   `json:"amount"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// PaymentMethodSummary represents payment method summary
type PaymentMethodSummary struct {
	MethodID     uint    `json:"method_id"`
	MethodName   string  `json:"method_name"`
	MethodType   string  `json:"method_type"`
	Transactions int     `json:"transactions"`
	Total        float64 `json:"total"`
}

// GetDIANClosingReport generates the DIAN closing report for a specific date
func (s *SalesService) GetDIANClosingReport(dateStr string) (*DIANClosingReport, error) {
	// Parse date
	reportDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, fmt.Errorf("invalid date format: %w", err)
	}

	// Get DIAN config
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return nil, fmt.Errorf("DIAN config not found: %w", err)
	}

	// Get restaurant config
	var restaurantConfig models.RestaurantConfig
	if err := s.db.First(&restaurantConfig).Error; err != nil {
		return nil, fmt.Errorf("restaurant config not found: %w", err)
	}

	// Get parametric data
	parametricData := models.GetDIANParametricData()

	// Initialize report
	report := &DIANClosingReport{
		ReportDate:  dateStr,
		GeneratedAt: time.Now(),
	}

	// Fill business info
	report.BusinessName = dianConfig.BusinessName
	if report.BusinessName == "" {
		report.BusinessName = restaurantConfig.BusinessName
	}
	report.CommercialName = restaurantConfig.Name
	report.NIT = dianConfig.IdentificationNumber
	if report.NIT == "" {
		report.NIT = restaurantConfig.IdentificationNumber
	}
	report.DV = dianConfig.DV
	if report.DV == "" {
		report.DV = restaurantConfig.DV
	}

	// Get regime and liability names
	if regime, ok := parametricData.TypeRegimes[dianConfig.TypeRegimeID]; ok {
		report.Regime = regime.Name
	}
	if liability, ok := parametricData.TypeLiabilities[dianConfig.TypeLiabilityID]; ok {
		report.Liability = liability.Name
	}

	report.Address = restaurantConfig.Address
	report.Phone = restaurantConfig.Phone
	report.Email = restaurantConfig.Email

	// Get city and department
	if dianConfig.MunicipalityID > 0 {
		if municipality, ok := parametricData.Municipalities[dianConfig.MunicipalityID]; ok {
			report.City = municipality.Name
			if dept, ok := parametricData.Departments[municipality.DepartmentID]; ok {
				report.Department = dept.Name
			}
		}
	}

	// Resolution info
	report.Resolution = dianConfig.ResolutionNumber
	report.ResolutionPrefix = dianConfig.ResolutionPrefix
	report.ResolutionFrom = dianConfig.ResolutionFrom
	report.ResolutionTo = dianConfig.ResolutionTo
	if !dianConfig.ResolutionDateFrom.IsZero() {
		report.ResolutionDateFrom = dianConfig.ResolutionDateFrom.Format("2006-01-02")
	}
	if !dianConfig.ResolutionDateTo.IsZero() {
		report.ResolutionDateTo = dianConfig.ResolutionDateTo.Format("2006-01-02")
	}

	// Get all DIAN sales for the date (only sales with electronic invoices)
	startOfDay := time.Date(reportDate.Year(), reportDate.Month(), reportDate.Day(), 0, 0, 0, 0, time.Local)
	endOfDay := startOfDay.Add(24 * time.Hour)

	var sales []models.Sale
	err = s.db.Preload("Order.Items.Product.Category").
		Preload("Order.Items.Modifiers.Modifier").
		Preload("Customer").
		Preload("PaymentDetails.PaymentMethod").
		Preload("ElectronicInvoice.CreditNotes").
		Preload("ElectronicInvoice.DebitNotes").
		Where("created_at >= ? AND created_at < ?", startOfDay, endOfDay).
		Where("needs_electronic_invoice = ?", true).
		Order("created_at ASC").
		Find(&sales).Error
	if err != nil {
		return nil, fmt.Errorf("error getting sales: %w", err)
	}

	// Calculate invoice range by finding min/max invoice numbers (not by date order)
	if len(sales) > 0 {
		var minInvoiceNum, maxInvoiceNum int
		var minPrefix, maxPrefix string
		firstFound := false

		for _, sale := range sales {
			if sale.ElectronicInvoice != nil {
				report.TotalInvoices++

				// Parse invoice number to compare numerically
				invoiceNum := 0
				fmt.Sscanf(sale.ElectronicInvoice.InvoiceNumber, "%d", &invoiceNum)

				if !firstFound {
					minInvoiceNum = invoiceNum
					maxInvoiceNum = invoiceNum
					minPrefix = sale.ElectronicInvoice.Prefix
					maxPrefix = sale.ElectronicInvoice.Prefix
					firstFound = true
				} else {
					if invoiceNum < minInvoiceNum {
						minInvoiceNum = invoiceNum
						minPrefix = sale.ElectronicInvoice.Prefix
					}
					if invoiceNum > maxInvoiceNum {
						maxInvoiceNum = invoiceNum
						maxPrefix = sale.ElectronicInvoice.Prefix
					}
				}
			}
		}

		if firstFound {
			report.FirstInvoiceNumber = fmt.Sprintf("%s%d", minPrefix, minInvoiceNum)
			report.LastInvoiceNumber = fmt.Sprintf("%s%d", maxPrefix, maxInvoiceNum)
		}
	}

	// Initialize maps for aggregation
	categoryMap := make(map[uint]*CategorySalesDetail)
	taxMap := make(map[int]*TaxBreakdownDetail)
	paymentMap := make(map[uint]*PaymentMethodSummary)

	// Process each sale
	for _, sale := range sales {
		report.TotalTransactions++
		report.TotalSubtotal += sale.Subtotal
		report.TotalTax += sale.Tax
		report.TotalDiscount += sale.Discount
		report.TotalSales += sale.Total

		// Process order items for category and tax breakdown
		if sale.Order != nil {
			for _, item := range sale.Order.Items {
				if item.Product == nil {
					continue
				}

				// Calculate item totals
				itemSubtotal := item.Subtotal
				taxTypeID := item.Product.TaxTypeID
				if taxTypeID == 0 {
					taxTypeID = 1 // Default to IVA 19%
				}

				// Get tax info
				taxType, ok := parametricData.TaxTypes[taxTypeID]
				if !ok {
					taxType = models.TaxType{ID: taxTypeID, Name: "IVA", Percent: 19.0}
				}

				// Calculate tax amount for this item
				itemTax := itemSubtotal * (taxType.Percent / 100)
				itemTotal := itemSubtotal + itemTax

				// Aggregate by category
				categoryID := item.Product.CategoryID
				categoryName := "Sin Categoría"
				if item.Product.Category != nil {
					categoryName = item.Product.Category.Name
				}

				if _, exists := categoryMap[categoryID]; !exists {
					categoryMap[categoryID] = &CategorySalesDetail{
						CategoryID:   categoryID,
						CategoryName: categoryName,
					}
				}
				categoryMap[categoryID].Quantity += item.Quantity
				categoryMap[categoryID].Subtotal += itemSubtotal
				categoryMap[categoryID].Tax += itemTax
				categoryMap[categoryID].Total += itemTotal

				// Aggregate by tax type
				if _, exists := taxMap[taxTypeID]; !exists {
					taxMap[taxTypeID] = &TaxBreakdownDetail{
						TaxTypeID:   taxTypeID,
						TaxTypeName: taxType.Name,
						TaxPercent:  taxType.Percent,
					}
				}
				taxMap[taxTypeID].BaseAmount += itemSubtotal
				taxMap[taxTypeID].TaxAmount += itemTax
				taxMap[taxTypeID].Total += itemTotal
				taxMap[taxTypeID].ItemCount += item.Quantity
			}
		}

		// Process payment methods
		for _, payment := range sale.PaymentDetails {
			if payment.PaymentMethod == nil {
				continue
			}
			methodID := payment.PaymentMethod.ID
			if _, exists := paymentMap[methodID]; !exists {
				paymentMap[methodID] = &PaymentMethodSummary{
					MethodID:   methodID,
					MethodName: payment.PaymentMethod.Name,
					MethodType: payment.PaymentMethod.Type,
				}
			}
			paymentMap[methodID].Transactions++
			paymentMap[methodID].Total += payment.Amount
		}

		// Process credit notes and debit notes
		if sale.ElectronicInvoice != nil {
			for _, cn := range sale.ElectronicInvoice.CreditNotes {
				// Only count credit notes created on the report date
				if cn.CreatedAt.Year() == reportDate.Year() &&
					cn.CreatedAt.Month() == reportDate.Month() &&
					cn.CreatedAt.Day() == reportDate.Day() {
					report.CreditNotes = append(report.CreditNotes, NoteDetail{
						Number:    cn.Number,
						Prefix:    cn.Prefix,
						Reason:    cn.Reason,
						Amount:    cn.Amount,
						Status:    cn.Status,
						CreatedAt: cn.CreatedAt,
					})
					report.TotalCreditNotes += cn.Amount
				}
			}
			for _, dn := range sale.ElectronicInvoice.DebitNotes {
				// Only count debit notes created on the report date
				if dn.CreatedAt.Year() == reportDate.Year() &&
					dn.CreatedAt.Month() == reportDate.Month() &&
					dn.CreatedAt.Day() == reportDate.Day() {
					report.DebitNotes = append(report.DebitNotes, NoteDetail{
						Number:    dn.Number,
						Prefix:    dn.Prefix,
						Reason:    dn.Reason,
						Amount:    dn.Amount,
						Status:    dn.Status,
						CreatedAt: dn.CreatedAt,
					})
					report.TotalDebitNotes += dn.Amount
				}
			}
		}
	}

	// Convert maps to slices
	for _, cat := range categoryMap {
		report.SalesByCategory = append(report.SalesByCategory, *cat)
	}
	for _, tax := range taxMap {
		report.SalesByTax = append(report.SalesByTax, *tax)
	}
	for _, pm := range paymentMap {
		report.PaymentMethods = append(report.PaymentMethods, *pm)
	}

	// Calculate adjustments and grand total
	report.TotalAdjustments = report.TotalDebitNotes - report.TotalCreditNotes
	report.GrandTotal = report.TotalSales + report.TotalAdjustments

	return report, nil
}

// PrintDIANClosingReport prints the DIAN closing report
func (s *SalesService) PrintDIANClosingReport(dateStr string) error {
	report, err := s.GetDIANClosingReport(dateStr)
	if err != nil {
		return err
	}

	return s.printerSvc.PrintDIANClosingReport(report)
}
