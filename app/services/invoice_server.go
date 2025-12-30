package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// InvoiceService handles electronic invoice operations
type InvoiceService struct {
	db     *gorm.DB
	config *models.DIANConfig
	client *http.Client
}

// NewInvoiceService creates a new invoice service
func NewInvoiceService() *InvoiceService {
	return &InvoiceService{
		db:     database.GetDB(),
		client: &http.Client{Timeout: 120 * time.Second}, // 2 minutes for DIAN API calls that may take time
	}
}

// InvoiceData represents the data structure for sending an invoice to DIAN
type InvoiceData struct {
	Number                    int                 `json:"number"`
	TypeDocumentID            int                 `json:"type_document_id"`
	Date                      string              `json:"date"`
	Time                      string              `json:"time"`
	ResolutionNumber          string              `json:"resolution_number"`
	Prefix                    string              `json:"prefix"`
	Notes                     string              `json:"notes,omitempty"`
	DisableConfirmationText   bool                `json:"disable_confirmation_text"`
	EstablishmentName         string              `json:"establishment_name,omitempty"`
	EstablishmentAddress      string              `json:"establishment_address,omitempty"`
	EstablishmentPhone        string              `json:"establishment_phone,omitempty"`
	EstablishmentMunicipality int                 `json:"establishment_municipality,omitempty"`
	EstablishmentEmail        string              `json:"establishment_email,omitempty"`
	Sendmail                  bool                `json:"sendmail"`
	SendmailToMe              bool                `json:"sendmailtome"`
	Customer                  InvoiceCustomer     `json:"customer"`
	PaymentForm               interface{}         `json:"payment_form"`
	LegalMonetaryTotals       LegalMonetaryTotals `json:"legal_monetary_totals"`
	TaxTotals                 []TaxTotal          `json:"tax_totals"`
	InvoiceLines              []InvoiceLine       `json:"invoice_lines"`
	AllowanceCharges          []AllowanceCharge   `json:"allowance_charges,omitempty"`
}

// InvoiceCustomer represents customer data for invoice
// Only required fields are always included; optional fields use omitempty
type InvoiceCustomer struct {
	// Core fields (always sent for all customers)
	IdentificationNumber string `json:"identification_number"`
	Name                 string `json:"name"`

	// Fields that may be omitted for CONSUMIDOR FINAL
	Email                        string `json:"email,omitempty"`
	TypeDocumentIdentificationID int    `json:"type_document_identification_id,omitempty"`

	// Optional fields (only sent if they have values)
	DV                   *string `json:"dv,omitempty"`
	Phone                *string `json:"phone,omitempty"`
	Address              *string `json:"address,omitempty"`
	MerchantRegistration string  `json:"merchant_registration,omitempty"`
	TypeOrganizationID   *int    `json:"type_organization_id,omitempty"`
	TypeLiabilityID      *int    `json:"type_liability_id,omitempty"`
	MunicipalityID       *int    `json:"municipality_id,omitempty"`
	TypeRegimeID         *int    `json:"type_regime_id,omitempty"`
	TaxID                *int    `json:"tax_id,omitempty"`
}

// PaymentFormData represents payment form data
type PaymentFormData struct {
	PaymentFormID   int    `json:"payment_form_id"`
	PaymentMethodID int    `json:"payment_method_id"`
	PaymentDueDate  string `json:"payment_due_date"`
	DurationMeasure string `json:"duration_measure"`
}

// LegalMonetaryTotals represents monetary totals
type LegalMonetaryTotals struct {
	LineExtensionAmount  string `json:"line_extension_amount"`
	TaxExclusiveAmount   string `json:"tax_exclusive_amount"`
	TaxInclusiveAmount   string `json:"tax_inclusive_amount"`
	AllowanceTotalAmount string `json:"allowance_total_amount,omitempty"`
	PayableAmount        string `json:"payable_amount"`
}

// TaxTotal represents tax information
type TaxTotal struct {
	TaxID         int    `json:"tax_id"`
	TaxAmount     string `json:"tax_amount"`
	Percent       string `json:"percent"`
	TaxableAmount string `json:"taxable_amount"`
}

// InvoiceLine represents an invoice line item
type InvoiceLine struct {
	UnitMeasureID            int               `json:"unit_measure_id"`
	InvoicedQuantity         string            `json:"invoiced_quantity"`
	LineExtensionAmount      string            `json:"line_extension_amount"`
	FreeOfChargeIndicator    bool              `json:"free_of_charge_indicator"`
	TaxTotals                []TaxTotal        `json:"tax_totals"`
	Description              string            `json:"description"`
	Notes                    string            `json:"notes,omitempty"`
	Code                     string            `json:"code"`
	TypeItemIdentificationID int               `json:"type_item_identification_id"`
	PriceAmount              string            `json:"price_amount"`
	BaseQuantity             string            `json:"base_quantity"`
	AllowanceCharges         []AllowanceCharge `json:"allowance_charges,omitempty"`
}

// AllowanceCharge represents discounts or charges
type AllowanceCharge struct {
	DiscountID            int    `json:"discount_id,omitempty"`
	ChargeIndicator       bool   `json:"charge_indicator"`
	AllowanceChargeReason string `json:"allowance_charge_reason"`
	Amount                string `json:"amount"`
	BaseAmount            string `json:"base_amount"`
}

// SendInvoice sends an electronic invoice to DIAN
func (s *InvoiceService) SendInvoice(sale *models.Sale, sendEmailToCustomer bool) (*models.ElectronicInvoice, error) {
	// Load DIAN config
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found")
	}
	s.config = &config

	// Debug: Log loaded config values
	fmt.Printf("📥 Loaded DIAN Config - Environment: %s, UseTestSetID: %v, TestSetID: %s\n",
		config.Environment, config.UseTestSetID, config.TestSetID)

	if !config.IsEnabled {
		return nil, fmt.Errorf("electronic invoicing is disabled")
	}

	// Prepare invoice data
	invoiceData, err := s.prepareInvoiceData(sale, sendEmailToCustomer)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare invoice data: %w", err)
	}

	// Marshal invoice data to JSON for storage (what we send to DIAN)
	requestDataJSON, err := json.Marshal(invoiceData)
	if err != nil {
		fmt.Printf("Warning: Could not marshal invoice request data to JSON: %v\n", err)
		requestDataJSON = []byte("{}")
	}

	// Send to DIAN API
	response, err := s.sendToDIAN(invoiceData, "invoice")

	// Always create electronic invoice record, even on error
	now := time.Now()
	status := "error"
	validationMessage := ""

	// Create error response if sendToDIAN failed
	if err != nil {
		// Build error response
		errorResponse := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"message": "Error al enviar factura a DIAN",
		}

		// Convert error to JSON
		responseJSON, _ := json.Marshal(errorResponse)

		// Create electronic invoice record with error
		electronicInvoice := &models.ElectronicInvoice{
			SaleID:            sale.ID,
			InvoiceNumber:     strconv.Itoa(invoiceData.Number),
			Prefix:            invoiceData.Prefix,
			Status:            status,
			ValidationMessage: fmt.Sprintf("Error: %s", err.Error()),
			DIANResponse:      string(responseJSON),
			RequestData:       string(requestDataJSON),
			LastError:         err.Error(),
			RetryCount:        0,
			CreatedAt:         now,
			UpdatedAt:         now,
		}

		if saveErr := s.db.Create(electronicInvoice).Error; saveErr != nil {
			fmt.Printf("Warning: Could not save error electronic invoice: %v\n", saveErr)
		}

		// Queue disabled (QueuedInvoice model removed)
		// s.queueInvoice(sale.ID, invoiceData, "invoice", err.Error())
		return electronicInvoice, fmt.Errorf("failed to send invoice: %w", err)
	}

	// Extract fields safely from response
	var uuid, cufe, qrCode, zipKey string
	if val, ok := response["uuid"].(string); ok {
		uuid = val
	}
	if val, ok := response["cufe"].(string); ok {
		cufe = val
	}
	if val, ok := response["qr_code"].(string); ok {
		qrCode = val
	}
	if val, ok := response["zip_key"].(string); ok {
		zipKey = val
	}

	// Determine initial status and validation (now already declared above)
	status = "sent"
	var isValid *bool
	validationMessage = ""

	// Check if there's a zipKey (means test_set_id was used - async validation)
	hasZipKey := zipKey != ""

	// Check if sync validation result is present (no test_set_id used)
	if isValidStr, ok := response["is_valid"].(string); ok {
		isValidBool := isValidStr == "true"
		isValid = &isValidBool

		if isValidBool {
			status = "accepted"
			validationMessage = "Validado exitosamente por DIAN (síncrono)"
		} else {
			status = "rejected"
			// Build error message from status and error messages
			statusCode, _ := response["status_code"].(string)
			statusDesc, _ := response["status_description"].(string)
			validationMessage = fmt.Sprintf("Código: %s - %s", statusCode, statusDesc)

			// Add detailed error messages if present
			if errorMsgs, ok := response["error_messages"].([]string); ok && len(errorMsgs) > 0 {
				validationMessage += "\nErrores:\n- " + strings.Join(errorMsgs, "\n- ")
			}
		}
	} else if hasZipKey {
		// test_set_id was used - validation is asynchronous via zipkey
		status = "validating"
		validationMessage = "Pendiente de validación DIAN (verificando con zipkey...)"
		fmt.Printf("📋 Invoice sent with test_set_id - Status: validating, ZipKey: %s\n", zipKey)
	}

	// Convert full response to JSON string for storage
	responseJSON, err := json.Marshal(response)
	if err != nil {
		fmt.Printf("Warning: Could not marshal DIAN response to JSON: %v\n", err)
		responseJSON = []byte("{}")
	}

	// Create electronic invoice record
	electronicInvoice := &models.ElectronicInvoice{
		SaleID:              sale.ID,
		InvoiceNumber:       strconv.Itoa(invoiceData.Number),
		Prefix:              invoiceData.Prefix,
		UUID:                &uuid,
		CUFE:                cufe,
		QRCode:              qrCode,
		ZipKey:              zipKey,
		Status:              status,
		IsValid:             isValid,
		ValidationMessage:   validationMessage,
		DIANResponse:        string(responseJSON),
		RequestData:         string(requestDataJSON),
		SentAt:              &now,
		ValidationCheckedAt: &now, // Set if sync validation was performed
	}

	// If validated synchronously and accepted, set AcceptedAt
	if isValid != nil && *isValid {
		electronicInvoice.AcceptedAt = &now
	}

	if err := s.db.Create(electronicInvoice).Error; err != nil {
		return nil, fmt.Errorf("failed to save electronic invoice: %w", err)
	}

	// Update invoice counter
	config.LastInvoiceNumber++
	s.db.Save(&config)

	// If zipkey was returned, start validation worker
	if hasZipKey {
		go s.validateZipKeyAsync(electronicInvoice.ID, zipKey)
	}

	return electronicInvoice, nil
}

// validateZipKeyAsync validates invoice with zipkey asynchronously
func (s *InvoiceService) validateZipKeyAsync(invoiceID uint, zipKey string) {
	maxRetries := 20 // Try for up to 20 times (20 * 3 seconds = 60 seconds)
	retryInterval := 3 * time.Second

	for i := 0; i < maxRetries; i++ {
		if i > 0 {
			time.Sleep(retryInterval)
		}

		fmt.Printf("🔍 Checking zipkey validation (attempt %d/%d) for invoice ID: %d\n", i+1, maxRetries, invoiceID)

		// Call DIAN API to check status with zipkey
		validated, isValid, validationMessage, dianResponse, err := s.checkZipKeyStatus(zipKey)

		if err != nil {
			fmt.Printf("❌ Error checking zipkey: %v\n", err)
			continue
		}

		if !validated {
			// Not ready yet, continue waiting
			fmt.Printf("⏳ Zipkey validation not ready yet, will retry...\n")
			continue
		}

		// Validation complete - update invoice
		now := time.Now()
		updateData := map[string]interface{}{
			"is_valid":              &isValid,
			"validation_message":    validationMessage,
			"dian_response":         dianResponse,
			"validation_checked_at": &now,
		}

		if isValid {
			updateData["status"] = "accepted"
			updateData["accepted_at"] = &now
			fmt.Printf("✅ Invoice validated successfully with zipkey\n")
		} else {
			updateData["status"] = "rejected"
			fmt.Printf("❌ Invoice rejected by DIAN: %s\n", validationMessage)
		}

		if err := s.db.Model(&models.ElectronicInvoice{}).Where("id = ?", invoiceID).Updates(updateData).Error; err != nil {
			fmt.Printf("Error updating invoice status: %v\n", err)
		}

		return // Successfully validated, exit
	}

	// Max retries reached without validation
	fmt.Printf("⚠️  Max retries reached for zipkey validation, invoice remains in validating status\n")
	s.db.Model(&models.ElectronicInvoice{}).Where("id = ?", invoiceID).Updates(map[string]interface{}{
		"validation_message": "Timeout esperando validación DIAN - Verifique manualmente",
	})
}

// checkZipKeyStatus checks invoice status using zipkey
func (s *InvoiceService) checkZipKeyStatus(zipKey string) (validated bool, isValid bool, validationMessage string, dianResponse string, err error) {
	// Load config
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		return false, false, "", "", fmt.Errorf("DIAN configuration not found")
	}

	// Call status endpoint
	url := fmt.Sprintf("%s/api/ubl2.1/status/zip/%s", config.APIURL, zipKey)

	// Prepare request body
	requestData := map[string]interface{}{
		"sendmail":     false,
		"sendmailtome": false,
		"is_payroll":   false,
		"is_eqdoc":     true,
	}

	jsonData, err := json.Marshal(requestData)
	if err != nil {
		return false, false, "", "", err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return false, false, "", "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return false, false, "", "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, false, "", "", err
	}

	if resp.StatusCode != http.StatusOK {
		return false, false, "", "", fmt.Errorf("API error: %s", string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return false, false, "", "", err
	}

	// Save full response
	responseJSON, _ := json.Marshal(result)
	dianResponse = string(responseJSON)

	// Navigate to IsValid field in nested structure
	// Path: ResponseDian -> Envelope -> Body -> GetStatusZipResponse -> GetStatusZipResult -> DianResponse -> IsValid
	responseDian, ok := result["ResponseDian"].(map[string]interface{})
	if !ok {
		return false, false, "", dianResponse, nil
	}

	envelope, ok := responseDian["Envelope"].(map[string]interface{})
	if !ok {
		return false, false, "", dianResponse, nil
	}

	soapBody, ok := envelope["Body"].(map[string]interface{})
	if !ok {
		return false, false, "", dianResponse, nil
	}

	getStatusZipResponse, ok := soapBody["GetStatusZipResponse"].(map[string]interface{})
	if !ok {
		return false, false, "", dianResponse, nil
	}

	getStatusZipResult, ok := getStatusZipResponse["GetStatusZipResult"].(map[string]interface{})
	if !ok {
		return false, false, "", dianResponse, nil
	}

	dianResponseData, ok := getStatusZipResult["DianResponse"].(map[string]interface{})
	if !ok {
		return false, false, "", dianResponse, nil
	}

	// Check if IsValid field is present (note: capital I and V)
	isValidStr, hasIsValid := dianResponseData["IsValid"].(string)
	if !hasIsValid || isValidStr == "" {
		// Validation not ready yet
		return false, false, "", dianResponse, nil
	}

	// Validation is ready
	validated = true
	isValid = isValidStr == "true"

	if isValid {
		validationMessage = "Validado exitosamente por DIAN"
	} else {
		// Extract error details from DianResponse
		statusCode, _ := dianResponseData["StatusCode"].(string)
		statusDesc, _ := dianResponseData["StatusDescription"].(string)
		validationMessage = fmt.Sprintf("Código: %s - %s", statusCode, statusDesc)

		// Check for error message
		if errorMsg, ok := dianResponseData["ErrorMessage"].(string); ok && errorMsg != "" {
			validationMessage += "\nError: " + errorMsg
		}
	}

	return validated, isValid, validationMessage, dianResponse, nil
}

// prepareInvoiceData prepares invoice data from a sale
func (s *InvoiceService) prepareInvoiceData(sale *models.Sale, sendEmailToCustomer bool) (*InvoiceData, error) {
	// Load related data including item modifiers for invoice description
	if err := s.db.Preload("Order.Items.Product").
		Preload("Order.Items.Modifiers.Modifier").
		Preload("Customer").
		Preload("PaymentDetails.PaymentMethod").
		First(sale, sale.ID).Error; err != nil {
		return nil, err
	}

	// Get next invoice number
	invoiceNumber := s.config.LastInvoiceNumber + 1

	// Check if this is CONSUMIDOR FINAL
	isConsumidorFinal := sale.Customer == nil || sale.Customer.IdentificationNumber == "222222222222"

	// Prepare invoice data
	// For CONSUMIDOR FINAL: sendmailtome = true (send invoice copy to company email)
	invoice := &InvoiceData{
		Number:                  invoiceNumber,
		TypeDocumentID:          1, // Electronic Invoice
		Date:                    time.Now().Format("2006-01-02"),
		Time:                    time.Now().Format("15:04:05"),
		ResolutionNumber:        s.config.ResolutionNumber,
		Prefix:                  s.config.ResolutionPrefix,
		Notes:                   sale.Notes,
		DisableConfirmationText: true,
		Sendmail:                sendEmailToCustomer,
		SendmailToMe:            isConsumidorFinal, // true for CONSUMIDOR FINAL so company receives the invoice
	}

	// Set establishment info
	var restaurantConfig models.RestaurantConfig
	s.db.First(&restaurantConfig)
	invoice.EstablishmentName = restaurantConfig.Name
	invoice.EstablishmentAddress = restaurantConfig.Address
	invoice.EstablishmentPhone = restaurantConfig.Phone
	invoice.EstablishmentEmail = restaurantConfig.Email

	// Set establishment municipality if configured
	if restaurantConfig.MunicipalityID != nil && *restaurantConfig.MunicipalityID > 0 {
		invoice.EstablishmentMunicipality = *restaurantConfig.MunicipalityID
	} else if s.config.MunicipalityID > 0 {
		// Fallback to DIAN config municipality if restaurant config doesn't have it
		invoice.EstablishmentMunicipality = s.config.MunicipalityID
	}
	// Note: Logo is uploaded separately via /api/ubl2.1/config/logo endpoint

	// Set customer info - use helper to build customer data from DB
	invoice.Customer = s.buildInvoiceCustomer(sale.Customer)

	// Set payment form
	if len(sale.PaymentDetails) > 0 {
		payment := sale.PaymentDetails[0]
		invoice.PaymentForm = PaymentFormData{
			PaymentFormID:   1, // Contado (1) - restaurants typically don't offer credit
			PaymentMethodID: s.getPaymentMethodCode(payment.PaymentMethod),
			PaymentDueDate:  time.Now().Format("2006-01-02"),
			DurationMeasure: "0", // Same day payment
		}
	}

	// Set monetary totals
	invoice.LegalMonetaryTotals = LegalMonetaryTotals{
		LineExtensionAmount:  fmt.Sprintf("%.2f", sale.Subtotal),
		TaxExclusiveAmount:   fmt.Sprintf("%.2f", sale.Subtotal),
		TaxInclusiveAmount:   fmt.Sprintf("%.2f", sale.Total),
		AllowanceTotalAmount: fmt.Sprintf("%.2f", sale.Discount),
		PayableAmount:        fmt.Sprintf("%.2f", sale.Total),
	}

	// Calculate tax totals by grouping products by their tax type
	// This supports invoices with multiple tax types (e.g., IVA 19%, IVA 0%, ICA, etc.)
	invoice.TaxTotals = s.calculateTaxTotals(sale.Order)

	// Set invoice lines - calculate taxes per product based on their TaxTypeID
	invoice.InvoiceLines = s.prepareInvoiceLines(sale.Order)

	// Set discounts and service charges
	invoice.AllowanceCharges = []AllowanceCharge{}

	// Add discount if any
	if sale.Discount > 0 {
		invoice.AllowanceCharges = append(invoice.AllowanceCharges, AllowanceCharge{
			DiscountID:            1,
			ChargeIndicator:       false,
			AllowanceChargeReason: "DESCUENTO GENERAL",
			Amount:                fmt.Sprintf("%.2f", sale.Discount),
			BaseAmount:            fmt.Sprintf("%.2f", sale.Subtotal+sale.Discount),
		})
	}

	// Add service charge if any (cargo por servicio/propina)
	if sale.ServiceCharge > 0 {
		invoice.AllowanceCharges = append(invoice.AllowanceCharges, AllowanceCharge{
			ChargeIndicator:       true, // true = cargo (charge), false = descuento (allowance)
			AllowanceChargeReason: "CARGO POR SERVICIO",
			Amount:                fmt.Sprintf("%.2f", sale.ServiceCharge),
			BaseAmount:            fmt.Sprintf("%.2f", sale.Subtotal),
		})
	}

	return invoice, nil
}

// calculateTaxTotals calculates tax totals grouped by tax type
// Considers company's TypeRegimeID: No Responsable de IVA always returns 0% regardless of products
func (s *InvoiceService) calculateTaxTotals(order *models.Order) []TaxTotal {
	// Map to accumulate tax amounts by tax type
	// Key: tax_id, Value: {taxableAmount, taxAmount, percent}
	type TaxAccumulator struct {
		TaxID         int
		TaxableAmount float64
		TaxAmount     float64
		Percent       float64
	}
	taxMap := make(map[int]*TaxAccumulator)

	// Iterate through all order items and accumulate taxes by type
	for _, item := range order.Items {
		// Get tax info based on company's TypeRegimeID and product's TaxTypeID
		dianTaxID, taxPercent := s.getTaxInfoForProduct(item.Product.TaxTypeID)

		// Calculate tax amount for this item
		taxAmount := item.Subtotal * (taxPercent / 100.0)

		// Accumulate in map
		if acc, exists := taxMap[dianTaxID]; exists {
			acc.TaxableAmount += item.Subtotal
			acc.TaxAmount += taxAmount
		} else {
			taxMap[dianTaxID] = &TaxAccumulator{
				TaxID:         dianTaxID,
				TaxableAmount: item.Subtotal,
				TaxAmount:     taxAmount,
				Percent:       taxPercent,
			}
		}
	}

	// Convert map to slice of TaxTotal
	taxTotals := make([]TaxTotal, 0, len(taxMap))
	for _, acc := range taxMap {
		taxTotals = append(taxTotals, TaxTotal{
			TaxID:         acc.TaxID,
			TaxAmount:     fmt.Sprintf("%.2f", acc.TaxAmount),
			Percent:       fmt.Sprintf("%.2f", acc.Percent),
			TaxableAmount: fmt.Sprintf("%.2f", acc.TaxableAmount),
		})
	}

	// If no taxes found, add a default IVA 0% entry to avoid empty tax_totals
	if len(taxTotals) == 0 {
		taxTotals = append(taxTotals, TaxTotal{
			TaxID:         1,
			TaxAmount:     "0.00",
			Percent:       "0.00",
			TaxableAmount: fmt.Sprintf("%.2f", order.Subtotal),
		})
	}

	return taxTotals
}

// prepareInvoiceLines prepares invoice lines from order items
// Considers company's TypeRegimeID and product's TaxTypeID to determine correct tax
// Includes modifier names in description (unless modifier has HideFromInvoice=true)
func (s *InvoiceService) prepareInvoiceLines(order *models.Order) []InvoiceLine {
	lines := make([]InvoiceLine, 0)

	for _, item := range order.Items {
		// Use product ID as code (DIAN requires non-empty code)
		productCode := fmt.Sprintf("%d", item.Product.ID)

		// Get tax info based on company's TypeRegimeID and product's TaxTypeID
		dianTaxID, taxPercent := s.getTaxInfoForProduct(item.Product.TaxTypeID)

		// Calculate tax amount based on determined percentage
		taxAmount := item.Subtotal * (taxPercent / 100.0)

		// Build description with modifiers (only those not hidden from invoice)
		description := item.Product.Name
		if len(item.Modifiers) > 0 {
			var visibleModifiers []string
			for _, itemMod := range item.Modifiers {
				// Only include modifier if it's loaded and not hidden from invoice
				if itemMod.Modifier != nil && !itemMod.Modifier.HideFromInvoice {
					visibleModifiers = append(visibleModifiers, itemMod.Modifier.Name)
				}
			}
			if len(visibleModifiers) > 0 {
				description = fmt.Sprintf("%s (%s)", item.Product.Name, strings.Join(visibleModifiers, ", "))
			}
		}

		// Calculate effective unit price (includes modifiers)
		// DIAN requires: line_extension_amount = price_amount × invoiced_quantity
		effectiveUnitPrice := item.Subtotal / float64(item.Quantity)

		line := InvoiceLine{
			UnitMeasureID:            item.Product.UnitMeasureID,
			InvoicedQuantity:         strconv.Itoa(item.Quantity),
			LineExtensionAmount:      fmt.Sprintf("%.2f", item.Subtotal),
			FreeOfChargeIndicator:    false,
			Description:              description,
			Notes:                    item.Notes,
			Code:                     productCode,
			TypeItemIdentificationID: 4,
			PriceAmount:              fmt.Sprintf("%.2f", effectiveUnitPrice),
			BaseQuantity:             "1",
			TaxTotals: []TaxTotal{
				{
					TaxID:         dianTaxID,
					TaxAmount:     fmt.Sprintf("%.2f", taxAmount),
					TaxableAmount: fmt.Sprintf("%.2f", item.Subtotal),
					Percent:       fmt.Sprintf("%.2f", taxPercent),
				},
			},
		}
		lines = append(lines, line)
	}

	return lines
}

// sendToDIAN sends data to DIAN API
func (s *InvoiceService) sendToDIAN(data interface{}, documentType string) (map[string]interface{}, error) {
	endpoint := "invoice"
	if documentType == "credit_note" {
		endpoint = "credit-note"
	} else if documentType == "debit_note" {
		endpoint = "debit-note"
	}

	url := fmt.Sprintf("%s/api/ubl2.1/%s", s.config.APIURL, endpoint)
	// Debug: Log the config values for test_set_id
	fmt.Printf("🔧 DIAN Config Debug - Environment: %s, UseTestSetID: %v, TestSetID: %s\n",
		s.config.Environment, s.config.UseTestSetID, s.config.TestSetID)

	// Only add test_set_id if in test mode AND UseTestSetID is true
	if s.config.Environment == "test" && s.config.UseTestSetID && s.config.TestSetID != "" {
		url = fmt.Sprintf("%s/%s", url, s.config.TestSetID)
		fmt.Printf("📋 Using test_set_id in URL: %s\n", url)
	} else {
		fmt.Printf("📋 NOT using test_set_id - URL: %s (Environment=%s, UseTestSetID=%v, TestSetID=%s)\n",
			url, s.config.Environment, s.config.UseTestSetID, s.config.TestSetID)
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.config.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DIAN API error: %s", string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	// Extract data from nested ResponseDian structure
	if responseDian, ok := result["ResponseDian"].(map[string]interface{}); ok {
		if envelope, ok := responseDian["Envelope"].(map[string]interface{}); ok {
			if body, ok := envelope["Body"].(map[string]interface{}); ok {
				// Case 1: Async response (with test_set_id) - Extract ZipKey
				if sendTestSetAsync, ok := body["SendTestSetAsyncResponse"].(map[string]interface{}); ok {
					if asyncResult, ok := sendTestSetAsync["SendTestSetAsyncResult"].(map[string]interface{}); ok {
						if zipKey, ok := asyncResult["ZipKey"].(string); ok {
							result["zip_key"] = zipKey
						}
					}
				}

				// Case 2: Sync response (without test_set_id) - Extract IsValid directly
				if sendBillSync, ok := body["SendBillSyncResponse"].(map[string]interface{}); ok {
					if syncResult, ok := sendBillSync["SendBillSyncResult"].(map[string]interface{}); ok {
						if isValidStr, ok := syncResult["IsValid"].(string); ok {
							result["is_valid"] = isValidStr
						}
						if statusCode, ok := syncResult["StatusCode"].(string); ok {
							result["status_code"] = statusCode
						}
						if statusDesc, ok := syncResult["StatusDescription"].(string); ok {
							result["status_description"] = statusDesc
						}
						// Extract error messages if present
						if errorMsg, ok := syncResult["ErrorMessage"].(map[string]interface{}); ok {
							if strings, ok := errorMsg["string"].([]interface{}); ok {
								var errors []string
								for _, s := range strings {
									if str, ok := s.(string); ok {
										errors = append(errors, str)
									}
								}
								result["error_messages"] = errors
							}
						}
					}
				}
			}
		}
	}

	// Map QRStr to qr_code for consistency
	if qrStr, ok := result["QRStr"].(string); ok {
		result["qr_code"] = qrStr
	}

	result["response"] = body
	return result, nil
}

// queueInvoice queues an invoice for later processing
// DISABLED: QueuedInvoice model removed (SQLite offline mode eliminated)
// func (s *InvoiceService) queueInvoice(saleID uint, data interface{}, invoiceType, errorMsg string) {
// 	jsonData, _ := json.Marshal(data)
// 	queue := &models.QueuedInvoice{
// 		SaleID:      saleID,
// 		InvoiceData: string(jsonData),
// 		Type:        invoiceType,
// 		RetryCount:  0,
// 		LastError:   errorMsg,
// 	}
// 	s.db.Create(queue)
// }

// getPaymentMethodCode converts payment type to DIAN code
func (s *InvoiceService) getPaymentMethodCode(paymentMethod *models.PaymentMethod) int {
	// Use DIAN payment method ID if configured
	if paymentMethod.DIANPaymentMethodID != nil && *paymentMethod.DIANPaymentMethodID > 0 {
		return *paymentMethod.DIANPaymentMethodID
	}

	// Fallback to inferring from type (for backwards compatibility)
	switch paymentMethod.Type {
	case "cash":
		return 10 // Efectivo
	case "card":
		return 48 // Tarjeta Débito (could also be 49 for credit cards)
	case "digital":
		return 47 // Transferencia Interbancaria
	case "check":
		return 20 // Cheque
	default:
		return 1 // Instrumento no definido
	}
}

// getDIANTaxIDFromCode maps DIAN TaxType Code to tax_id for electronic invoicing
// According to DIAN parametric data:
//
//	Code "01" -> tax_id 1 (IVA - all rates 0%, 5%, 19%)
//	Code "02" -> tax_id 2 (IC - Impuesto al Consumo)
//	Code "03" -> tax_id 3 (ICA - Impuesto de Industria y Comercio)
//	Code "04" -> tax_id 4 (INC - Impuesto Nacional al Consumo)
func (s *InvoiceService) getDIANTaxIDFromCode(taxCode string) int {
	switch taxCode {
	case "01":
		return 1 // IVA (Value Added Tax)
	case "02":
		return 2 // IC (Consumption Tax)
	case "03":
		return 3 // ICA (Industry and Commerce Tax)
	case "04":
		return 4 // INC (National Consumption Tax)
	default:
		return 1 // Default to IVA
	}
}

// getTaxInfoForProduct determines the correct DIAN tax_id and percentage
// based on company's TypeRegimeID (fiscal responsibility) and product's TaxTypeID
// Returns: (dianTaxID, taxPercent)
func (s *InvoiceService) getTaxInfoForProduct(productTaxTypeID int) (int, float64) {
	parametricData := models.GetDIANParametricData()

	// CRITICAL: Check company's TypeRegimeID first
	// TypeRegimeID = 2 (No Responsable de IVA) means company CANNOT charge IVA
	if s.config.TypeRegimeID == 2 {
		// No Responsable de IVA - Always use IVA 0% regardless of product configuration
		return 1, 0.00 // tax_id: 1 (IVA), percent: 0%
	}

	// Company is Responsable de IVA (TypeRegimeID = 1 or other)
	// Use product's TaxTypeID to determine the correct tax
	taxType, exists := parametricData.TaxTypes[productTaxTypeID]
	if !exists {
		// Default to IVA 19% if tax type not found
		taxType = parametricData.TaxTypes[1]
	}

	// Map TaxType.Code to DIAN tax_id
	dianTaxID := s.getDIANTaxIDFromCode(taxType.Code)

	return dianTaxID, taxType.Percent
}

// inferDocumentTypeID maps identification_type string to DIAN TypeDocumentIdentificationID
// Supports multiple formats (PA, PP, Pasaporte all map to Pasaporte ID 7)
func (s *InvoiceService) inferDocumentTypeID(identificationType string) int {
	switch identificationType {
	case "RC":
		return 1 // Registro civil
	case "TI":
		return 2 // Tarjeta de identidad
	case "CC":
		return 3 // Cédula de ciudadanía
	case "TE":
		return 4 // Tarjeta de extranjería
	case "CE":
		return 5 // Cédula de extranjería
	case "NIT":
		return 6 // NIT
	case "PA", "PP", "Pasaporte":
		return 7 // Pasaporte (supports PA, PP, and full name)
	case "DIE":
		return 8 // Documento de identificación extranjero
	case "NITP":
		return 9 // NIT de otro país
	case "NUIP":
		return 10 // NUIP
	case "PEP":
		return 11 // PEP (Permiso Especial de Permanencia)
	case "PPT":
		return 12 // PPT (Permiso Protección Temporal)
	default:
		return 3 // Default to CC (Cédula de ciudadanía)
	}
}

// buildInvoiceCustomer creates InvoiceCustomer from Customer model
// Loads default "Consumidor Final" from database if customer is nil
// For CONSUMIDOR FINAL (222222222222), only minimal fields are returned
func (s *InvoiceService) buildInvoiceCustomer(customer *models.Customer) InvoiceCustomer {
	// Load default customer if none provided
	if customer == nil {
		var defaultCustomer models.Customer
		if err := s.db.Where("identification_number = ?", "222222222222").First(&defaultCustomer).Error; err != nil {
			// Fallback if not found in DB (shouldn't happen after migration)
			fmt.Printf("⚠️  Default consumer customer not found in database: %v\n", err)
			defaultCustomer = models.Customer{
				IdentificationNumber: "222222222222",
				Name:                 "CONSUMIDOR FINAL",
			}
		}
		customer = &defaultCustomer
	}

	// ============================================================
	// CONSUMIDOR FINAL - Return minimal required fields + email logic with priority
	// Per DIAN API specification (Postman collection):
	// - identification_number: 222222222222
	// - name: "CONSUMIDOR FINAL"
	// - merchant_registration: "0000000-00"
	// Optional: email (priority: dialog > DefaultConsumerEmail > none), municipality_id
	// ============================================================
	if customer.IdentificationNumber == "222222222222" {
		invoiceCustomer := InvoiceCustomer{
			IdentificationNumber: "222222222222",
			Name:                 "CONSUMIDOR FINAL",
			MerchantRegistration: "0000000-00",
		}

		// EMAIL PRIORITY LOGIC:
		// 1. Email from payment dialog (customer.Email) - HIGHEST PRIORITY
		// 2. DefaultConsumerEmail from config - FALLBACK
		// 3. No email - if none configured

		// Check if customer has email from payment dialog (PRIORITY 1)
		if customer.Email != "" {
			invoiceCustomer.Email = customer.Email
			fmt.Printf("✅ CONSUMIDOR FINAL - Using email from payment dialog: %s\n", customer.Email)
		} else {
			// Load company config for fallback email (PRIORITY 2)
			var restaurantConfig models.RestaurantConfig
			if err := s.db.First(&restaurantConfig).Error; err == nil {
				// DEBUG: Log all email fields to diagnose issue
				fmt.Printf("🔍 DEBUG - Customer.Email (dialog): '%s'\n", customer.Email)
				fmt.Printf("🔍 DEBUG - RestaurantConfig.Email: '%s'\n", restaurantConfig.Email)
				fmt.Printf("🔍 DEBUG - RestaurantConfig.DefaultConsumerEmail: '%s'\n", restaurantConfig.DefaultConsumerEmail)

				// Use DefaultConsumerEmail if configured
				if restaurantConfig.DefaultConsumerEmail != "" {
					invoiceCustomer.Email = restaurantConfig.DefaultConsumerEmail
					fmt.Printf("✅ CONSUMIDOR FINAL - Using DefaultConsumerEmail from config: %s\n", restaurantConfig.DefaultConsumerEmail)
				} else {
					fmt.Printf("⚠️  CONSUMIDOR FINAL - No email configured (neither in dialog nor DefaultConsumerEmail)\n")
				}

				// Add company municipality if configured
				// NO fallback - if not configured, don't send municipality_id field
				if restaurantConfig.MunicipalityID != nil && *restaurantConfig.MunicipalityID > 0 {
					invoiceCustomer.MunicipalityID = restaurantConfig.MunicipalityID
					fmt.Printf("CONSUMIDOR FINAL - Using company municipality ID: %d\n", *restaurantConfig.MunicipalityID)
				}
			}
		}

		fmt.Printf("CONSUMIDOR FINAL - Final customer data: identification=%s, name=%s, merchant_registration=%s, email=%s\n",
			invoiceCustomer.IdentificationNumber, invoiceCustomer.Name, invoiceCustomer.MerchantRegistration, invoiceCustomer.Email)
		return invoiceCustomer
	}

	// ============================================================
	// REAL CUSTOMER - Include all available fields
	// ============================================================

	// Build invoice customer with required fields per DIAN Resolución 0165 de 2023:
	// - identification_number
	// - type_document_identification_id
	// - name
	// - email
	// - dv (only for NIT)
	// All other fields are OPTIONAL per DIAN (not required by law)

	fmt.Printf("🔍 DEBUG REAL CUSTOMER - Building invoice for: %s (%s)\n", customer.Name, customer.IdentificationNumber)
	if customer.TypeRegimeID != nil {
		fmt.Printf("  Type Regime ID: %d\n", *customer.TypeRegimeID)
	} else {
		fmt.Printf("  Type Regime ID: <nil>\n")
	}
	if customer.TypeLiabilityID != nil {
		fmt.Printf("  Type Liability ID: %d\n", *customer.TypeLiabilityID)
	} else {
		fmt.Printf("  Type Liability ID: <nil>\n")
	}
	if customer.MunicipalityID != nil {
		fmt.Printf("  Municipality ID: %d\n", *customer.MunicipalityID)
	} else {
		fmt.Printf("  Municipality ID: <nil>\n")
	}

	invoiceCustomer := InvoiceCustomer{
		IdentificationNumber: customer.IdentificationNumber,
		Name:                 customer.Name,
	}

	// Email is required
	if customer.Email != "" {
		invoiceCustomer.Email = customer.Email
	}

	// TypeDocumentIdentificationID is required - infer from identification type if not set
	if customer.TypeDocumentIdentificationID != nil {
		invoiceCustomer.TypeDocumentIdentificationID = *customer.TypeDocumentIdentificationID
	} else {
		invoiceCustomer.TypeDocumentIdentificationID = s.inferDocumentTypeID(customer.IdentificationType)
	}

	// DV is required for NIT
	if customer.DV != nil && *customer.DV != "" {
		invoiceCustomer.DV = customer.DV
	}

	// ============================================================
	// OPTIONAL FIELDS - Only include if customer provided them
	// These are NOT required by DIAN Resolución 0165 de 2023
	// ============================================================

	if customer.Phone != "" {
		invoiceCustomer.Phone = &customer.Phone
	}
	if customer.Address != "" {
		invoiceCustomer.Address = &customer.Address
	}
	if customer.MerchantRegistration != nil && *customer.MerchantRegistration != "" {
		invoiceCustomer.MerchantRegistration = *customer.MerchantRegistration
	}
	if customer.TypeOrganizationID != nil {
		invoiceCustomer.TypeOrganizationID = customer.TypeOrganizationID
	}
	if customer.TypeLiabilityID != nil {
		invoiceCustomer.TypeLiabilityID = customer.TypeLiabilityID
	}
	if customer.TypeRegimeID != nil {
		invoiceCustomer.TypeRegimeID = customer.TypeRegimeID
	}
	if customer.MunicipalityID != nil {
		invoiceCustomer.MunicipalityID = customer.MunicipalityID
	}

	// Debug: Log final invoice customer data
	fmt.Printf("✅ REAL CUSTOMER - Final invoice data:\n")
	fmt.Printf("  Identification: %s\n", invoiceCustomer.IdentificationNumber)
	fmt.Printf("  Name: %s\n", invoiceCustomer.Name)
	if invoiceCustomer.TypeRegimeID != nil {
		fmt.Printf("  Type Regime ID: %d\n", *invoiceCustomer.TypeRegimeID)
	} else {
		fmt.Printf("  Type Regime ID: <not included>\n")
	}
	if invoiceCustomer.TypeLiabilityID != nil {
		fmt.Printf("  Type Liability ID: %d\n", *invoiceCustomer.TypeLiabilityID)
	} else {
		fmt.Printf("  Type Liability ID: <not included>\n")
	}
	if invoiceCustomer.MunicipalityID != nil {
		fmt.Printf("  Municipality ID: %d\n", *invoiceCustomer.MunicipalityID)
	} else {
		fmt.Printf("  Municipality ID: <not included>\n")
	}

	return invoiceCustomer
}

// SendCreditNote sends a credit note to DIAN
func (s *InvoiceService) SendCreditNote(electronicInvoice *models.ElectronicInvoice, reason string, discrepancyCode int) (*models.CreditNote, error) {
	// Load DIAN config
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found")
	}
	s.config = &config

	if !config.IsEnabled {
		return nil, fmt.Errorf("electronic invoicing is disabled")
	}

	// Prepare credit note data
	creditNoteData, err := s.prepareCreditNoteData(electronicInvoice, reason, discrepancyCode)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare credit note data: %w", err)
	}

	// Send to DIAN API
	response, err := s.sendToDIAN(creditNoteData, "credit_note")
	if err != nil {
		// Queue disabled (QueuedInvoice model removed)
		// s.queueInvoice(electronicInvoice.SaleID, creditNoteData, "credit_note", err.Error())
		return nil, fmt.Errorf("failed to send credit note: %w", err)
	}

	// Create credit note record
	creditNote := &models.CreditNote{
		ElectronicInvoiceID: electronicInvoice.ID,
		Number:              strconv.Itoa(creditNoteData.Number),
		Prefix:              creditNoteData.Prefix,
		UUID:                response["uuid"].(string),
		Reason:              reason,
		DiscrepancyCode:     discrepancyCode,
		Amount:              creditNoteData.Amount,
		Status:              "sent",
		DIANResponse:        string(response["response"].([]byte)),
		XMLDocument:         string(response["xml"].([]byte)),
	}

	if err := s.db.Create(creditNote).Error; err != nil {
		return nil, fmt.Errorf("failed to save credit note: %w", err)
	}

	// Update credit note counter
	config.LastCreditNoteNumber++
	s.db.Save(&config)

	return creditNote, nil
}

// SendDebitNote sends a debit note to DIAN
func (s *InvoiceService) SendDebitNote(electronicInvoice *models.ElectronicInvoice, reason string, discrepancyCode int) (*models.DebitNote, error) {
	// Load DIAN config
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found")
	}
	s.config = &config

	if !config.IsEnabled {
		return nil, fmt.Errorf("electronic invoicing is disabled")
	}

	// Prepare debit note data
	debitNoteData, err := s.prepareDebitNoteData(electronicInvoice, reason, discrepancyCode)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare debit note data: %w", err)
	}

	// Send to DIAN API
	response, err := s.sendToDIAN(debitNoteData, "debit_note")
	if err != nil {
		// Queue disabled (QueuedInvoice model removed)
		// s.queueInvoice(electronicInvoice.SaleID, debitNoteData, "debit_note", err.Error())
		return nil, fmt.Errorf("failed to send debit note: %w", err)
	}

	// Create debit note record
	debitNote := &models.DebitNote{
		ElectronicInvoiceID: electronicInvoice.ID,
		Number:              strconv.Itoa(debitNoteData.Number),
		Prefix:              debitNoteData.Prefix,
		UUID:                response["uuid"].(string),
		Reason:              reason,
		DiscrepancyCode:     discrepancyCode,
		Amount:              debitNoteData.Amount,
		Status:              "sent",
		DIANResponse:        string(response["response"].([]byte)),
		XMLDocument:         string(response["xml"].([]byte)),
	}

	if err := s.db.Create(debitNote).Error; err != nil {
		return nil, fmt.Errorf("failed to save debit note: %w", err)
	}

	// Update debit note counter
	config.LastDebitNoteNumber++
	s.db.Save(&config)

	return debitNote, nil
}

// CreditNoteData represents credit note data structure
type CreditNoteData struct {
	Number                  int                 `json:"number"`
	TypeDocumentID          int                 `json:"type_document_id"`
	Date                    string              `json:"date"`
	Time                    string              `json:"time"`
	Prefix                  string              `json:"prefix"`
	Notes                   string              `json:"notes"`
	BillingReference        BillingReference    `json:"billing_reference"`
	DiscrepancyResponseCode int                 `json:"discrepancyresponsecode"`
	Customer                InvoiceCustomer     `json:"customer"`
	TaxTotals               []TaxTotal          `json:"tax_totals"`
	LegalMonetaryTotals     LegalMonetaryTotals `json:"legal_monetary_totals"`
	CreditNoteLines         []CreditNoteLine    `json:"credit_note_lines"`
	Amount                  float64             `json:"amount"`
}

// DebitNoteData represents debit note data structure
type DebitNoteData struct {
	Number                         int                 `json:"number"`
	TypeDocumentID                 int                 `json:"type_document_id"`
	Date                           string              `json:"date"`
	Time                           string              `json:"time"`
	Prefix                         string              `json:"prefix"`
	Notes                          string              `json:"notes"`
	BillingReference               BillingReference    `json:"billing_reference"`
	DiscrepancyResponseCode        int                 `json:"discrepancyresponsecode"`
	DiscrepancyResponseDescription string              `json:"discrepancyresponsedescription"`
	Customer                       InvoiceCustomer     `json:"customer"`
	TaxTotals                      []TaxTotal          `json:"tax_totals"`
	RequestedMonetaryTotals        LegalMonetaryTotals `json:"requested_monetary_totals"`
	DebitNoteLines                 []DebitNoteLine     `json:"debit_note_lines"`
	Amount                         float64             `json:"amount"`
}

// BillingReference represents billing reference for notes (NC/ND)
type BillingReference struct {
	Number         string `json:"number"`           // Invoice number
	UUID           string `json:"uuid"`             // CUFE of original invoice (used as unique identifier)
	IssueDate      string `json:"issue_date"`       // Original invoice issue date
	TypeDocumentID int    `json:"type_document_id"` // Document type (1=Invoice)
}

// CreditNoteLine represents a credit note line item
type CreditNoteLine struct {
	UnitMeasureID            int        `json:"unit_measure_id"`
	InvoicedQuantity         string     `json:"invoiced_quantity"`
	LineExtensionAmount      string     `json:"line_extension_amount"`
	FreeOfChargeIndicator    bool       `json:"free_of_charge_indicator"`
	TaxTotals                []TaxTotal `json:"tax_totals"`
	Description              string     `json:"description"`
	Notes                    string     `json:"notes"`
	Code                     string     `json:"code"`
	TypeItemIdentificationID int        `json:"type_item_identification_id"`
	PriceAmount              string     `json:"price_amount"`
	BaseQuantity             string     `json:"base_quantity"`
}

// DebitNoteLine represents a debit note line item
type DebitNoteLine struct {
	UnitMeasureID            int        `json:"unit_measure_id"`
	InvoicedQuantity         string     `json:"invoiced_quantity"`
	LineExtensionAmount      string     `json:"line_extension_amount"`
	FreeOfChargeIndicator    bool       `json:"free_of_charge_indicator"`
	TaxTotals                []TaxTotal `json:"tax_totals"`
	Description              string     `json:"description"`
	Notes                    string     `json:"notes"`
	Code                     string     `json:"code"`
	TypeItemIdentificationID int        `json:"type_item_identification_id"`
	PriceAmount              string     `json:"price_amount"`
	BaseQuantity             string     `json:"base_quantity"`
}

// prepareCreditNoteData prepares credit note data
func (s *InvoiceService) prepareCreditNoteData(electronicInvoice *models.ElectronicInvoice, reason string, discrepancyCode int) (*CreditNoteData, error) {
	// Load related data
	var sale models.Sale
	if err := s.db.Preload("Order.Items.Product").Preload("Customer").First(&sale, electronicInvoice.SaleID).Error; err != nil {
		return nil, err
	}

	// Get next credit note number
	creditNoteNumber := s.config.LastCreditNoteNumber + 1

	// Prepare credit note data
	creditNote := &CreditNoteData{
		Number:                  creditNoteNumber,
		TypeDocumentID:          26, // Credit Note
		Date:                    time.Now().Format("2006-01-02"),
		Time:                    time.Now().Format("15:04:05"),
		Prefix:                  "NCP", // Credit Note Prefix
		Notes:                   reason,
		DiscrepancyResponseCode: discrepancyCode,
		BillingReference: BillingReference{
			Number:         electronicInvoice.InvoiceNumber,
			UUID:           electronicInvoice.CUFE, // Always use CUFE as unique identifier
			IssueDate:      electronicInvoice.CreatedAt.Format("2006-01-02"),
			TypeDocumentID: 1, // Invoice
		},
	}

	// Set customer info (same as original invoice)
	creditNote.Customer = s.buildInvoiceCustomer(sale.Customer)

	// Set monetary totals (same as original invoice)
	creditNote.LegalMonetaryTotals = LegalMonetaryTotals{
		LineExtensionAmount: fmt.Sprintf("%.2f", sale.Subtotal),
		TaxExclusiveAmount:  fmt.Sprintf("%.2f", sale.Subtotal),
		TaxInclusiveAmount:  fmt.Sprintf("%.2f", sale.Total),
		PayableAmount:       fmt.Sprintf("%.2f", sale.Total),
	}

	// Calculate tax totals by grouping products by their tax type
	// This supports credit notes with multiple tax types (e.g., IVA 19%, IVA 0%, ICA, etc.)
	creditNote.TaxTotals = s.calculateTaxTotals(sale.Order)

	// Set credit note lines - calculate taxes per product based on their TaxTypeID
	creditNote.CreditNoteLines = s.prepareCreditNoteLines(sale.Order)
	creditNote.Amount = sale.Total

	return creditNote, nil
}

// prepareDebitNoteData prepares debit note data
func (s *InvoiceService) prepareDebitNoteData(electronicInvoice *models.ElectronicInvoice, reason string, discrepancyCode int) (*DebitNoteData, error) {
	// Load related data
	var sale models.Sale
	if err := s.db.Preload("Order.Items.Product").Preload("Customer").First(&sale, electronicInvoice.SaleID).Error; err != nil {
		return nil, err
	}

	// Get next debit note number
	debitNoteNumber := s.config.LastDebitNoteNumber + 1

	// Prepare debit note data
	debitNote := &DebitNoteData{
		Number:                         debitNoteNumber,
		TypeDocumentID:                 25, // Debit Note
		Date:                           time.Now().Format("2006-01-02"),
		Time:                           time.Now().Format("15:04:05"),
		Prefix:                         "NDP", // Debit Note Prefix
		Notes:                          reason,
		DiscrepancyResponseCode:        discrepancyCode,
		DiscrepancyResponseDescription: reason,
		BillingReference: BillingReference{
			Number:         electronicInvoice.InvoiceNumber,
			UUID:           electronicInvoice.CUFE, // Always use CUFE as unique identifier
			IssueDate:      electronicInvoice.CreatedAt.Format("2006-01-02"),
			TypeDocumentID: 1, // Invoice
		},
	}

	// Set customer info (same as original invoice)
	debitNote.Customer = s.buildInvoiceCustomer(sale.Customer)

	// Set monetary totals (same as original invoice)
	debitNote.RequestedMonetaryTotals = LegalMonetaryTotals{
		LineExtensionAmount: fmt.Sprintf("%.2f", sale.Subtotal),
		TaxExclusiveAmount:  fmt.Sprintf("%.2f", sale.Subtotal),
		TaxInclusiveAmount:  fmt.Sprintf("%.2f", sale.Total),
		PayableAmount:       fmt.Sprintf("%.2f", sale.Total),
	}

	// Calculate tax totals by grouping products by their tax type
	// This supports debit notes with multiple tax types (e.g., IVA 19%, IVA 0%, ICA, etc.)
	debitNote.TaxTotals = s.calculateTaxTotals(sale.Order)

	// Set debit note lines - calculate taxes per product based on their TaxTypeID
	debitNote.DebitNoteLines = s.prepareDebitNoteLines(sale.Order)
	debitNote.Amount = sale.Total

	return debitNote, nil
}

// prepareCreditNoteLines prepares credit note lines from order items
// Considers company's TypeRegimeID and product's TaxTypeID to determine correct tax
func (s *InvoiceService) prepareCreditNoteLines(order *models.Order) []CreditNoteLine {
	lines := make([]CreditNoteLine, 0)

	for _, item := range order.Items {
		// Use product ID as code
		productCode := fmt.Sprintf("%d", item.Product.ID)

		// Get tax info based on company's TypeRegimeID and product's TaxTypeID
		dianTaxID, taxPercent := s.getTaxInfoForProduct(item.Product.TaxTypeID)

		// Calculate tax amount based on determined percentage
		taxAmount := item.Subtotal * (taxPercent / 100.0)

		line := CreditNoteLine{
			UnitMeasureID:            item.Product.UnitMeasureID,
			InvoicedQuantity:         strconv.Itoa(item.Quantity),
			LineExtensionAmount:      fmt.Sprintf("%.2f", item.Subtotal),
			FreeOfChargeIndicator:    false,
			Description:              item.Product.Name,
			Notes:                    item.Notes,
			Code:                     productCode,
			TypeItemIdentificationID: 4,
			PriceAmount:              fmt.Sprintf("%.2f", item.UnitPrice),
			BaseQuantity:             "1",
			TaxTotals: []TaxTotal{
				{
					TaxID:         dianTaxID,
					TaxAmount:     fmt.Sprintf("%.2f", taxAmount),
					TaxableAmount: fmt.Sprintf("%.2f", item.Subtotal),
					Percent:       fmt.Sprintf("%.2f", taxPercent),
				},
			},
		}
		lines = append(lines, line)
	}

	return lines
}

// prepareDebitNoteLines prepares debit note lines from order items
// Considers company's TypeRegimeID and product's TaxTypeID to determine correct tax
func (s *InvoiceService) prepareDebitNoteLines(order *models.Order) []DebitNoteLine {
	lines := make([]DebitNoteLine, 0)

	for _, item := range order.Items {
		// Use product ID as code
		productCode := fmt.Sprintf("%d", item.Product.ID)

		// Get tax info based on company's TypeRegimeID and product's TaxTypeID
		dianTaxID, taxPercent := s.getTaxInfoForProduct(item.Product.TaxTypeID)

		// Calculate tax amount based on determined percentage
		taxAmount := item.Subtotal * (taxPercent / 100.0)

		line := DebitNoteLine{
			UnitMeasureID:            item.Product.UnitMeasureID,
			InvoicedQuantity:         strconv.Itoa(item.Quantity),
			LineExtensionAmount:      fmt.Sprintf("%.2f", item.Subtotal),
			FreeOfChargeIndicator:    false,
			Description:              item.Product.Name,
			Notes:                    item.Notes,
			Code:                     productCode,
			TypeItemIdentificationID: 4,
			PriceAmount:              fmt.Sprintf("%.2f", item.UnitPrice),
			BaseQuantity:             "1",
			TaxTotals: []TaxTotal{
				{
					TaxID:         dianTaxID,
					TaxAmount:     fmt.Sprintf("%.2f", taxAmount),
					TaxableAmount: fmt.Sprintf("%.2f", item.Subtotal),
					Percent:       fmt.Sprintf("%.2f", taxPercent),
				},
			},
		}
		lines = append(lines, line)
	}

	return lines
}

// ProcessQueuedInvoices processes queued invoices
// DISABLED: QueuedInvoice model removed (SQLite offline mode eliminated)
// To re-enable invoice queuing, recreate QueuedInvoice model in PostgreSQL
/*
func (s *InvoiceService) ProcessQueuedInvoices() error {
	// Load DIAN config first to avoid nil pointer errors
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		fmt.Printf("⚠️  DIAN configuration not found, skipping queued invoices: %v\n", err)
		return nil // Return nil to avoid crashing, just skip processing
	}
	s.config = &config

	if !config.IsEnabled {
		fmt.Println("⚠️  Electronic invoicing is disabled, skipping queued invoices")
		return nil
	}

	var queued []models.QueuedInvoice
	s.db.Where("retry_count < ?", 3).Find(&queued)

	if len(queued) > 0 {
		fmt.Printf("📋 Processing %d queued invoices...\n", len(queued))
	}

	for _, q := range queued {
		var data interface{}
		if err := json.Unmarshal([]byte(q.InvoiceData), &data); err != nil {
			fmt.Printf("❌ Failed to unmarshal queued invoice %d: %v\n", q.ID, err)
			continue
		}

		if _, err := s.sendToDIAN(data, q.Type); err != nil {
			q.RetryCount++
			q.LastError = err.Error()
			s.db.Save(&q)
			fmt.Printf("❌ Retry %d/%d failed for queued invoice %d: %v\n", q.RetryCount, 3, q.ID, err)
		} else {
			// Success - delete from queue
			s.db.Delete(&q)
			fmt.Printf("✅ Successfully sent queued invoice %d\n", q.ID)
		}
	}

	return nil
}
*/

// CompanyConfigRequest represents the data structure for company configuration
type CompanyConfigRequest struct {
	TypeDocumentIdentificationID int    `json:"type_document_identification_id"`
	TypeOrganizationID           int    `json:"type_organization_id"`
	TypeRegimeID                 int    `json:"type_regime_id"`
	TypeLiabilityID              int    `json:"type_liability_id"`
	BusinessName                 string `json:"business_name"`
	MerchantRegistration         string `json:"merchant_registration"`
	MunicipalityID               int    `json:"municipality_id"`
	Address                      string `json:"address"`
	Phone                        string `json:"phone"`
	Email                        string `json:"email"`
	MailHost                     string `json:"mail_host,omitempty"`
	MailPort                     string `json:"mail_port,omitempty"`
	MailUsername                 string `json:"mail_username,omitempty"`
	MailPassword                 string `json:"mail_password,omitempty"`
	MailEncryption               string `json:"mail_encryption,omitempty"`
}

// CompanyConfigResponse represents the API response from company configuration
type CompanyConfigResponse struct {
	Message  string `json:"message"`
	APIToken string `json:"api_token"`
}

// ConfigureCompany configures the company in the DIAN API and stores the API token
func (s *InvoiceService) ConfigureCompany() (*CompanyConfigResponse, error) {
	// Load DIAN config
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found")
	}

	// Load restaurant config for address, phone, email
	var restaurantConfig models.RestaurantConfig
	if err := s.db.First(&restaurantConfig).Error; err != nil {
		return nil, fmt.Errorf("restaurant configuration not found")
	}

	// Validate required fields
	if config.IdentificationNumber == "" || config.DV == "" {
		return nil, fmt.Errorf("NIT and DV are required")
	}

	if config.APIURL == "" {
		return nil, fmt.Errorf("API URL is required")
	}

	// Prepare configuration request
	configReq := CompanyConfigRequest{
		TypeDocumentIdentificationID: config.TypeDocumentID,
		TypeOrganizationID:           config.TypeOrganizationID,
		TypeRegimeID:                 config.TypeRegimeID,
		TypeLiabilityID:              config.TypeLiabilityID,
		BusinessName:                 config.BusinessName,
		MerchantRegistration:         config.MerchantRegistration,
		MunicipalityID:               config.MunicipalityID,
		Address:                      restaurantConfig.Address,
		Phone:                        restaurantConfig.Phone,
		Email:                        restaurantConfig.Email,
		MailHost:                     config.EmailHost,
		MailPort:                     strconv.Itoa(config.EmailPort),
		MailUsername:                 config.EmailUsername,
		MailPassword:                 config.EmailPassword,
		MailEncryption:               config.EmailEncryption,
	}

	// Build URL: {api_url}/api/ubl2.1/config/{nit}/{dv}
	url := fmt.Sprintf("%s/api/ubl2.1/config/%s/%s",
		config.APIURL,
		config.IdentificationNumber,
		config.DV)

	// Marshal request body
	jsonData, err := json.Marshal(configReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal configuration data: %w", err)
	}

	// Create HTTP request (no authorization required for initial config)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var configResp CompanyConfigResponse
	if err := json.Unmarshal(body, &configResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Validate API token in response
	if configResp.APIToken == "" {
		return nil, fmt.Errorf("API token not received in response")
	}

	// Save API token in DIAN config
	config.APIToken = configResp.APIToken
	if err := s.db.Save(&config).Error; err != nil {
		return nil, fmt.Errorf("failed to save API token: %w", err)
	}

	return &configResp, nil
}

// CheckInvoiceStatus checks the validation status of an invoice with DIAN using ZipKey
func (s *InvoiceService) CheckInvoiceStatus(invoiceID uint) error {
	// Load DIAN config
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found: %w", err)
	}

	// Load electronic invoice
	var invoice models.ElectronicInvoice
	if err := s.db.First(&invoice, invoiceID).Error; err != nil {
		return fmt.Errorf("electronic invoice not found: %w", err)
	}

	if invoice.ZipKey == "" {
		return fmt.Errorf("no zip key found for invoice")
	}

	// Build URL
	url := fmt.Sprintf("%s/api/ubl2.1/status/zip/%s", config.APIURL, invoice.ZipKey)

	// Prepare request body
	requestData := map[string]interface{}{
		"sendmail":     false,
		"sendmailtome": false,
		"is_payroll":   false,
		"is_eqdoc":     true,
	}

	jsonData, err := json.Marshal(requestData)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("failed to parse response: %w", err)
	}

	// Extract validation result from nested structure
	// ResponseDian.Envelope.Body.GetStatusZipResponse.GetStatusZipResult.DianResponse.IsValid
	var isValidStr string
	var statusCode string
	var statusDescription string

	if responseDian, ok := result["ResponseDian"].(map[string]interface{}); ok {
		if envelope, ok := responseDian["Envelope"].(map[string]interface{}); ok {
			if body, ok := envelope["Body"].(map[string]interface{}); ok {
				if getStatusZipResp, ok := body["GetStatusZipResponse"].(map[string]interface{}); ok {
					if getStatusZipResult, ok := getStatusZipResp["GetStatusZipResult"].(map[string]interface{}); ok {
						if dianResponse, ok := getStatusZipResult["DianResponse"].(map[string]interface{}); ok {
							if val, ok := dianResponse["IsValid"].(string); ok {
								isValidStr = val
							}
							if val, ok := dianResponse["StatusCode"].(string); ok {
								statusCode = val
							}
							if val, ok := dianResponse["StatusDescription"].(string); ok {
								statusDescription = val
							}
						}
					}
				}
			}
		}
	}

	// Update invoice with validation result
	now := time.Now()
	invoice.ValidationCheckedAt = &now

	if isValidStr != "" {
		isValid := isValidStr == "true"
		invoice.IsValid = &isValid

		if isValid {
			invoice.Status = "accepted"
			invoice.AcceptedAt = &now
			invoice.ValidationMessage = "Validado exitosamente por DIAN"
		} else {
			invoice.Status = "rejected"
			invoice.ValidationMessage = fmt.Sprintf("Código: %s - %s", statusCode, statusDescription)
		}
	} else {
		// Still validating
		invoice.Status = "validating"
		invoice.ValidationMessage = fmt.Sprintf("En validación - Código: %s - %s", statusCode, statusDescription)
	}

	if err := s.db.Save(&invoice).Error; err != nil {
		return fmt.Errorf("failed to update invoice: %w", err)
	}

	fmt.Printf("Invoice %d validation status: IsValid=%v, Status=%s, Message=%s\n",
		invoice.ID, invoice.IsValid, invoice.Status, invoice.ValidationMessage)

	return nil
}

// StartValidationWorker starts a background worker to check invoice validation status
func StartValidationWorker() {
	go func() {
		ticker := time.NewTicker(30 * time.Second) // Check every 30 seconds
		defer ticker.Stop()

		for range ticker.C {
			processValidationQueue()
		}
	}()
}

// processValidationQueue processes invoices that need async validation checking (with ZipKey)
func processValidationQueue() {
	db := database.GetDB()

	// Find invoices that need async validation (only those with ZipKey)
	// Invoices without ZipKey have sync validation already processed at send time
	var invoices []models.ElectronicInvoice
	err := db.Where("zip_key != ? AND zip_key IS NOT NULL", "").
		Where("(status = ? OR status = ?)", "sent", "validating").
		Find(&invoices).Error

	if err != nil {
		fmt.Printf("Error querying validation queue: %v\n", err)
		return
	}

	if len(invoices) == 0 {
		return
	}

	fmt.Printf("Processing %d invoices for async validation check...\n", len(invoices))

	service := NewInvoiceService()
	for _, invoice := range invoices {
		// Skip if recently checked (within last 20 seconds)
		if invoice.ValidationCheckedAt != nil {
			timeSinceCheck := time.Since(*invoice.ValidationCheckedAt)
			if timeSinceCheck < 20*time.Second {
				continue
			}
		}

		// Skip if no ZipKey (shouldn't happen with the query, but safety check)
		if invoice.ZipKey == "" {
			continue
		}

		fmt.Printf("Checking async validation status for invoice ID %d (ZipKey: %s)...\n", invoice.ID, invoice.ZipKey)
		if err := service.CheckInvoiceStatus(invoice.ID); err != nil {
			fmt.Printf("Error checking invoice %d: %v\n", invoice.ID, err)
		}
	}
}
