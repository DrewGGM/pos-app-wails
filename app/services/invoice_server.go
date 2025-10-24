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
		client: &http.Client{Timeout: 30 * time.Second},
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
type InvoiceCustomer struct {
	IdentificationNumber         string  `json:"identification_number"`
	DV                           *string `json:"dv,omitempty"`
	Name                         string  `json:"name"`
	Phone                        string  `json:"phone"`
	Address                      string  `json:"address"`
	Email                        string  `json:"email"`
	MerchantRegistration         string  `json:"merchant_registration"`
	TypeDocumentIdentificationID int     `json:"type_document_identification_id"`
	TypeOrganizationID           int     `json:"type_organization_id"`
	TypeLiabilityID              int     `json:"type_liability_id"`
	MunicipalityID               int     `json:"municipality_id"`
	TypeRegimeID                 int     `json:"type_regime_id"`
	TaxID                        *int    `json:"tax_id,omitempty"`
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

	if !config.IsEnabled {
		return nil, fmt.Errorf("electronic invoicing is disabled")
	}

	// Prepare invoice data
	invoiceData, err := s.prepareInvoiceData(sale, sendEmailToCustomer)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare invoice data: %w", err)
	}

	// Send to DIAN API
	response, err := s.sendToDIAN(invoiceData, "invoice")
	if err != nil {
		// Queue for later retry if offline
		s.queueInvoice(sale.ID, invoiceData, "invoice", err.Error())
		return nil, fmt.Errorf("failed to send invoice: %w", err)
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

	// Determine initial status and validation
	now := time.Now()
	status := "sent"
	var isValid *bool
	var validationMessage string

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
		DIANResponse:        string(response["response"].([]byte)),
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

	return electronicInvoice, nil
}

// prepareInvoiceData prepares invoice data from a sale
func (s *InvoiceService) prepareInvoiceData(sale *models.Sale, sendEmailToCustomer bool) (*InvoiceData, error) {
	// Load related data
	if err := s.db.Preload("Order.Items.Product").
		Preload("Customer").
		Preload("PaymentDetails.PaymentMethod").
		First(sale, sale.ID).Error; err != nil {
		return nil, err
	}

	// Get next invoice number
	invoiceNumber := s.config.LastInvoiceNumber + 1

	// Prepare invoice data
	invoice := &InvoiceData{
		Number:                  invoiceNumber,
		TypeDocumentID:          1, // Electronic Invoice
		Date:                    time.Now().Format("2006-01-02"),
		Time:                    time.Now().Format("15:04:05"),
		ResolutionNumber:        s.config.ResolutionNumber,
		Prefix:                  s.config.ResolutionPrefix,
		Notes:                   sale.Notes,
		DisableConfirmationText: true,
		Sendmail:                sendEmailToCustomer, // Use value from payment dialog instead of config
		SendmailToMe:            false,
	}

	// Set establishment info
	var restaurantConfig models.RestaurantConfig
	s.db.First(&restaurantConfig)
	invoice.EstablishmentName = restaurantConfig.Name
	invoice.EstablishmentAddress = restaurantConfig.Address
	invoice.EstablishmentPhone = restaurantConfig.Phone
	invoice.EstablishmentEmail = restaurantConfig.Email

	// Set customer info - use helper to build customer data from DB
	invoice.Customer = s.buildInvoiceCustomer(sale.Customer)

	// Set payment form
	if len(sale.PaymentDetails) > 0 {
		payment := sale.PaymentDetails[0]
		invoice.PaymentForm = PaymentFormData{
			PaymentFormID:   1, // Contado (1) - restaurants typically don't offer credit
			PaymentMethodID: s.getPaymentMethodCode(payment.PaymentMethod.Type),
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

	// Set tax totals
	invoice.TaxTotals = []TaxTotal{
		{
			TaxID:         1, // IVA
			TaxAmount:     fmt.Sprintf("%.2f", sale.Tax),
			Percent:       "19",
			TaxableAmount: fmt.Sprintf("%.2f", sale.Subtotal),
		},
	}

	// Set invoice lines
	invoice.InvoiceLines = s.prepareInvoiceLines(sale.Order)

	// Set discounts if any
	if sale.Discount > 0 {
		invoice.AllowanceCharges = []AllowanceCharge{
			{
				DiscountID:            1,
				ChargeIndicator:       false,
				AllowanceChargeReason: "DESCUENTO GENERAL",
				Amount:                fmt.Sprintf("%.2f", sale.Discount),
				BaseAmount:            fmt.Sprintf("%.2f", sale.Subtotal+sale.Discount),
			},
		}
	}

	return invoice, nil
}

// prepareInvoiceLines prepares invoice lines from order items
func (s *InvoiceService) prepareInvoiceLines(order *models.Order) []InvoiceLine {
	lines := make([]InvoiceLine, 0)

	// Get DIAN parametric data for tax calculations
	dianData := models.GetDIANParametricData()

	for _, item := range order.Items {
		// Use product ID as code (DIAN requires non-empty code)
		// Based on API examples, simple unique identifiers are acceptable
		productCode := fmt.Sprintf("%d", item.Product.ID)

		// Get tax rate from product's tax type
		taxType := dianData.TaxTypes[item.Product.TaxTypeID]
		taxPercent := taxType.Percent
		taxAmount := item.Subtotal * (taxPercent / 100.0)

		line := InvoiceLine{
			UnitMeasureID:            item.Product.UnitMeasureID, // From product configuration (Porción, Ración, Unidad)
			InvoicedQuantity:         strconv.Itoa(item.Quantity),
			LineExtensionAmount:      fmt.Sprintf("%.2f", item.Subtotal),
			FreeOfChargeIndicator:    false,
			Description:              item.Product.Name,
			Notes:                    item.Notes,
			Code:                     productCode, // Non-empty code required by DIAN
			TypeItemIdentificationID: 4, // Standard item code (Código estándar de ítems)
			PriceAmount:              fmt.Sprintf("%.2f", item.UnitPrice),
			BaseQuantity:             "1",
			TaxTotals: []TaxTotal{
				{
					TaxID:         item.Product.TaxTypeID, // From product configuration
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
	// Only add test_set_id if in test mode AND UseTestSetID is true
	if s.config.Environment == "test" && s.config.UseTestSetID && s.config.TestSetID != "" {
		url = fmt.Sprintf("%s/%s", url, s.config.TestSetID)
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	// LOG: Request details
	fmt.Println("========== DIAN INVOICE REQUEST ==========")
	fmt.Printf("URL: %s\n", url)
	fmt.Printf("Method: POST\n")
	fmt.Printf("Environment: %s\n", s.config.Environment)
	fmt.Printf("Token: %s...\n", s.config.APIToken[:20])
	fmt.Println("Payload:")
	fmt.Println(string(jsonData))
	fmt.Println("==========================================")

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.config.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		fmt.Printf("ERROR: Failed to send request to DIAN: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("ERROR: Failed to read response body: %v\n", err)
		return nil, err
	}

	// LOG: Response details
	fmt.Println("========== DIAN INVOICE RESPONSE ==========")
	fmt.Printf("Status Code: %d\n", resp.StatusCode)
	fmt.Printf("Status: %s\n", resp.Status)
	fmt.Println("Response Body:")
	fmt.Println(string(body))
	fmt.Println("===========================================")

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("ERROR: DIAN API returned error status %d\n", resp.StatusCode)
		return nil, fmt.Errorf("DIAN API error: %s", string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("ERROR: Failed to parse JSON response: %v\n", err)
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

	// LOG: Parsed response
	fmt.Println("========== DIAN PARSED RESPONSE ==========")
	fmt.Printf("Success: %v\n", result["success"])
	fmt.Printf("Message: %v\n", result["message"])
	if uuid, ok := result["uuid"]; ok {
		fmt.Printf("UUID: %v\n", uuid)
	}
	if cufe, ok := result["cufe"]; ok {
		fmt.Printf("CUFE: %v\n", cufe)
	}
	if zipKey, ok := result["zip_key"]; ok {
		fmt.Printf("ZIP Key (Async): %v\n", zipKey)
	}
	if qrCode, ok := result["qr_code"]; ok {
		fmt.Printf("QR Code: %v\n", qrCode)
	}
	// Log sync validation if present
	if isValid, ok := result["is_valid"]; ok {
		fmt.Printf("IsValid (Sync): %v\n", isValid)
		if statusCode, ok := result["status_code"]; ok {
			fmt.Printf("Status Code: %v\n", statusCode)
		}
		if statusDesc, ok := result["status_description"]; ok {
			fmt.Printf("Status Description: %v\n", statusDesc)
		}
		if errorMsgs, ok := result["error_messages"].([]string); ok && len(errorMsgs) > 0 {
			fmt.Println("Error Messages:")
			for _, msg := range errorMsgs {
				fmt.Printf("  - %s\n", msg)
			}
		}
	}
	fmt.Println("==========================================")

	result["response"] = body
	return result, nil
}

// queueInvoice queues an invoice for later processing
func (s *InvoiceService) queueInvoice(saleID uint, data interface{}, invoiceType, errorMsg string) {
	jsonData, _ := json.Marshal(data)

	queue := &models.QueuedInvoice{
		SaleID:      saleID,
		InvoiceData: string(jsonData),
		Type:        invoiceType,
		RetryCount:  0,
		LastError:   errorMsg,
	}

	s.db.Create(queue)
}

// getPaymentMethodCode converts payment type to DIAN code
func (s *InvoiceService) getPaymentMethodCode(paymentType string) int {
	switch paymentType {
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

// inferDocumentTypeID maps identification_type string to DIAN TypeDocumentIdentificationID
func (s *InvoiceService) inferDocumentTypeID(identificationType string) int {
	switch identificationType {
	case "RC":
		return 1 // Registro civil
	case "TI":
		return 2 // Tarjeta de identidad
	case "CC":
		return 3 // Cédula de ciudadanía
	case "CE":
		return 5 // Cédula de extranjería
	case "NIT":
		return 6 // NIT
	case "Pasaporte":
		return 7 // Pasaporte
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

	// Build invoice customer - only send fields that are populated
	invoiceCustomer := InvoiceCustomer{
		IdentificationNumber: customer.IdentificationNumber,
		Name:                 customer.Name,
	}

	// Add optional fields only if they exist
	if customer.DV != nil && *customer.DV != "" {
		invoiceCustomer.DV = customer.DV
	}
	if customer.Phone != "" {
		invoiceCustomer.Phone = customer.Phone
	}
	if customer.Address != "" {
		invoiceCustomer.Address = customer.Address
	}
	if customer.Email != "" {
		invoiceCustomer.Email = customer.Email
	}
	if customer.MerchantRegistration != nil && *customer.MerchantRegistration != "" {
		invoiceCustomer.MerchantRegistration = *customer.MerchantRegistration
	} else {
		invoiceCustomer.MerchantRegistration = "0000000-00" // Default DIAN value
	}

	// Add DIAN parametric IDs only if specified (for corporate customers)
	if customer.TypeDocumentIdentificationID != nil {
		invoiceCustomer.TypeDocumentIdentificationID = *customer.TypeDocumentIdentificationID
	} else {
		invoiceCustomer.TypeDocumentIdentificationID = s.inferDocumentTypeID(customer.IdentificationType)
	}
	if customer.TypeOrganizationID != nil {
		invoiceCustomer.TypeOrganizationID = *customer.TypeOrganizationID
	} else {
		invoiceCustomer.TypeOrganizationID = 2 // Default: Persona Natural
	}
	if customer.TypeLiabilityID != nil {
		invoiceCustomer.TypeLiabilityID = *customer.TypeLiabilityID
	} else {
		invoiceCustomer.TypeLiabilityID = 117 // Default: No responsable (R-99-PN)
	}
	if customer.TypeRegimeID != nil {
		invoiceCustomer.TypeRegimeID = *customer.TypeRegimeID
	} else {
		invoiceCustomer.TypeRegimeID = 2 // Default: No responsable de IVA
	}
	if customer.MunicipalityID != nil {
		invoiceCustomer.MunicipalityID = *customer.MunicipalityID
	} else {
		invoiceCustomer.MunicipalityID = s.config.MunicipalityID // Use company municipality as default
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
		// Queue for later retry if offline
		s.queueInvoice(electronicInvoice.SaleID, creditNoteData, "credit_note", err.Error())
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
		// Queue for later retry if offline
		s.queueInvoice(electronicInvoice.SaleID, debitNoteData, "debit_note", err.Error())
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
	Number         string `json:"number"`          // Invoice number
	UUID           string `json:"uuid"`            // CUFE of original invoice (used as unique identifier)
	IssueDate      string `json:"issue_date"`      // Original invoice issue date
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

	// Set tax totals
	creditNote.TaxTotals = []TaxTotal{
		{
			TaxID:         1, // IVA
			TaxAmount:     fmt.Sprintf("%.2f", sale.Tax),
			Percent:       "19",
			TaxableAmount: fmt.Sprintf("%.2f", sale.Subtotal),
		},
	}

	// Set credit note lines (same as original invoice)
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

	// Set tax totals
	debitNote.TaxTotals = []TaxTotal{
		{
			TaxID:         1, // IVA
			TaxAmount:     fmt.Sprintf("%.2f", sale.Tax),
			Percent:       "19",
			TaxableAmount: fmt.Sprintf("%.2f", sale.Subtotal),
		},
	}

	// Set debit note lines (same as original invoice)
	debitNote.DebitNoteLines = s.prepareDebitNoteLines(sale.Order)
	debitNote.Amount = sale.Total

	return debitNote, nil
}

// prepareCreditNoteLines prepares credit note lines from order items
func (s *InvoiceService) prepareCreditNoteLines(order *models.Order) []CreditNoteLine {
	lines := make([]CreditNoteLine, 0)

	// Get DIAN parametric data for tax calculations
	dianData := models.GetDIANParametricData()

	for _, item := range order.Items {
		// Use product ID as code
		productCode := fmt.Sprintf("%d", item.Product.ID)

		// Get tax rate from product's tax type
		taxType := dianData.TaxTypes[item.Product.TaxTypeID]
		taxPercent := taxType.Percent
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
					TaxID:         item.Product.TaxTypeID,
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
func (s *InvoiceService) prepareDebitNoteLines(order *models.Order) []DebitNoteLine {
	lines := make([]DebitNoteLine, 0)

	// Get DIAN parametric data for tax calculations
	dianData := models.GetDIANParametricData()

	for _, item := range order.Items {
		// Use product ID as code
		productCode := fmt.Sprintf("%d", item.Product.ID)

		// Get tax rate from product's tax type
		taxType := dianData.TaxTypes[item.Product.TaxTypeID]
		taxPercent := taxType.Percent
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
					TaxID:         item.Product.TaxTypeID,
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
