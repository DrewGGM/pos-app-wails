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
func (s *InvoiceService) SendInvoice(sale *models.Sale) (*models.ElectronicInvoice, error) {
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
	invoiceData, err := s.prepareInvoiceData(sale)
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

	// Create electronic invoice record
	electronicInvoice := &models.ElectronicInvoice{
		SaleID:        sale.ID,
		InvoiceNumber: strconv.Itoa(invoiceData.Number),
		Prefix:        invoiceData.Prefix,
		UUID:          response["uuid"].(string),
		CUFE:          response["cufe"].(string),
		QRCode:        response["qr_code"].(string),
		Status:        "sent",
		DIANResponse:  string(response["response"].([]byte)),
		SentAt:        &[]time.Time{time.Now()}[0],
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
func (s *InvoiceService) prepareInvoiceData(sale *models.Sale) (*InvoiceData, error) {
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
		Sendmail:                s.config.SendEmail,
		SendmailToMe:            false,
	}

	// Set establishment info
	var restaurantConfig models.RestaurantConfig
	s.db.First(&restaurantConfig)
	invoice.EstablishmentName = restaurantConfig.Name
	invoice.EstablishmentAddress = restaurantConfig.Address
	invoice.EstablishmentPhone = restaurantConfig.Phone
	invoice.EstablishmentEmail = restaurantConfig.Email

	// Set customer info
	if sale.Customer != nil {
		invoice.Customer = InvoiceCustomer{
			IdentificationNumber:         sale.Customer.IdentificationNumber,
			DV:                           sale.Customer.DV,
			Name:                         sale.Customer.Name,
			Phone:                        sale.Customer.Phone,
			Address:                      sale.Customer.Address,
			Email:                        sale.Customer.Email,
			MerchantRegistration:         "0000000-00",
			TypeDocumentIdentificationID: 3, // CC
			TypeOrganizationID:           2, // Natural person
			TypeLiabilityID:              14,
			MunicipalityID:               *sale.Customer.MunicipalityID,
			TypeRegimeID:                 2,
		}
	} else {
		// Default consumer
		invoice.Customer = InvoiceCustomer{
			IdentificationNumber:         "222222222222",
			Name:                         "CONSUMIDOR FINAL",
			Phone:                        "0000000",
			Address:                      "NO REGISTRADO",
			Email:                        "",
			MerchantRegistration:         "0000000-00",
			TypeDocumentIdentificationID: 1,
			TypeOrganizationID:           2,
			TypeLiabilityID:              14,
			MunicipalityID:               s.config.MunicipalityID,
			TypeRegimeID:                 2,
		}
	}

	// Set payment form
	if len(sale.PaymentDetails) > 0 {
		payment := sale.PaymentDetails[0]
		invoice.PaymentForm = PaymentFormData{
			PaymentFormID:   1, // Cash
			PaymentMethodID: s.getPaymentMethodCode(payment.PaymentMethod.Type),
			PaymentDueDate:  time.Now().Format("2006-01-02"),
			DurationMeasure: "0",
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

	for _, item := range order.Items {
		line := InvoiceLine{
			UnitMeasureID:            70, // Unit
			InvoicedQuantity:         strconv.Itoa(item.Quantity),
			LineExtensionAmount:      fmt.Sprintf("%.2f", item.Subtotal),
			FreeOfChargeIndicator:    false,
			Description:              item.Product.Name,
			Notes:                    item.Notes,
			Code:                     item.Product.SKU,
			TypeItemIdentificationID: 4,
			PriceAmount:              fmt.Sprintf("%.2f", item.UnitPrice),
			BaseQuantity:             "1",
			TaxTotals: []TaxTotal{
				{
					TaxID:         1,
					TaxAmount:     fmt.Sprintf("%.2f", item.Subtotal*0.19),
					TaxableAmount: fmt.Sprintf("%.2f", item.Subtotal),
					Percent:       "19.00",
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
	if s.config.Environment == "test" && s.config.TestSetID != "" {
		url = fmt.Sprintf("%s/%s", url, s.config.TestSetID)
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
		return 10
	case "card":
		return 48
	case "digital":
		return 47
	case "check":
		return 20
	default:
		return 1
	}
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

// BillingReference represents billing reference for notes
type BillingReference struct {
	Number         string `json:"number"`
	UUID           string `json:"uuid"`
	IssueDate      string `json:"issue_date"`
	TypeDocumentID int    `json:"type_document_id"`
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
			UUID:           electronicInvoice.UUID,
			IssueDate:      electronicInvoice.CreatedAt.Format("2006-01-02"),
			TypeDocumentID: 1, // Invoice
		},
	}

	// Set customer info (same as original invoice)
	if sale.Customer != nil {
		creditNote.Customer = InvoiceCustomer{
			IdentificationNumber:         sale.Customer.IdentificationNumber,
			DV:                           sale.Customer.DV,
			Name:                         sale.Customer.Name,
			Phone:                        sale.Customer.Phone,
			Address:                      sale.Customer.Address,
			Email:                        sale.Customer.Email,
			MerchantRegistration:         "0000000-00",
			TypeDocumentIdentificationID: 3, // CC
			TypeOrganizationID:           2, // Natural person
			TypeLiabilityID:              14,
			MunicipalityID:               *sale.Customer.MunicipalityID,
			TypeRegimeID:                 2,
		}
	} else {
		// Default consumer
		creditNote.Customer = InvoiceCustomer{
			IdentificationNumber:         "222222222222",
			Name:                         "CONSUMIDOR FINAL",
			Phone:                        "0000000",
			Address:                      "NO REGISTRADO",
			Email:                        "",
			MerchantRegistration:         "0000000-00",
			TypeDocumentIdentificationID: 1,
			TypeOrganizationID:           2,
			TypeLiabilityID:              14,
			MunicipalityID:               s.config.MunicipalityID,
			TypeRegimeID:                 2,
		}
	}

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
			UUID:           electronicInvoice.UUID,
			IssueDate:      electronicInvoice.CreatedAt.Format("2006-01-02"),
			TypeDocumentID: 1, // Invoice
		},
	}

	// Set customer info (same as original invoice)
	if sale.Customer != nil {
		debitNote.Customer = InvoiceCustomer{
			IdentificationNumber:         sale.Customer.IdentificationNumber,
			DV:                           sale.Customer.DV,
			Name:                         sale.Customer.Name,
			Phone:                        sale.Customer.Phone,
			Address:                      sale.Customer.Address,
			Email:                        sale.Customer.Email,
			MerchantRegistration:         "0000000-00",
			TypeDocumentIdentificationID: 3, // CC
			TypeOrganizationID:           2, // Natural person
			TypeLiabilityID:              14,
			MunicipalityID:               *sale.Customer.MunicipalityID,
			TypeRegimeID:                 2,
		}
	} else {
		// Default consumer
		debitNote.Customer = InvoiceCustomer{
			IdentificationNumber:         "222222222222",
			Name:                         "CONSUMIDOR FINAL",
			Phone:                        "0000000",
			Address:                      "NO REGISTRADO",
			Email:                        "",
			MerchantRegistration:         "0000000-00",
			TypeDocumentIdentificationID: 1,
			TypeOrganizationID:           2,
			TypeLiabilityID:              14,
			MunicipalityID:               s.config.MunicipalityID,
			TypeRegimeID:                 2,
		}
	}

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

	for _, item := range order.Items {
		line := CreditNoteLine{
			UnitMeasureID:            70, // Unit
			InvoicedQuantity:         strconv.Itoa(item.Quantity),
			LineExtensionAmount:      fmt.Sprintf("%.2f", item.Subtotal),
			FreeOfChargeIndicator:    false,
			Description:              item.Product.Name,
			Notes:                    item.Notes,
			Code:                     item.Product.SKU,
			TypeItemIdentificationID: 4,
			PriceAmount:              fmt.Sprintf("%.2f", item.UnitPrice),
			BaseQuantity:             "1",
			TaxTotals: []TaxTotal{
				{
					TaxID:         1,
					TaxAmount:     fmt.Sprintf("%.2f", item.Subtotal*0.19),
					TaxableAmount: fmt.Sprintf("%.2f", item.Subtotal),
					Percent:       "19.00",
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

	for _, item := range order.Items {
		line := DebitNoteLine{
			UnitMeasureID:            70, // Unit
			InvoicedQuantity:         strconv.Itoa(item.Quantity),
			LineExtensionAmount:      fmt.Sprintf("%.2f", item.Subtotal),
			FreeOfChargeIndicator:    false,
			Description:              item.Product.Name,
			Notes:                    item.Notes,
			Code:                     item.Product.SKU,
			TypeItemIdentificationID: 4,
			PriceAmount:              fmt.Sprintf("%.2f", item.UnitPrice),
			BaseQuantity:             "1",
			TaxTotals: []TaxTotal{
				{
					TaxID:         1,
					TaxAmount:     fmt.Sprintf("%.2f", item.Subtotal*0.19),
					TaxableAmount: fmt.Sprintf("%.2f", item.Subtotal),
					Percent:       "19.00",
				},
			},
		}
		lines = append(lines, line)
	}

	return lines
}

// ProcessQueuedInvoices processes queued invoices
func (s *InvoiceService) ProcessQueuedInvoices() error {
	var queued []models.QueuedInvoice
	s.db.Where("retry_count < ?", 3).Find(&queued)

	for _, q := range queued {
		var data interface{}
		if err := json.Unmarshal([]byte(q.InvoiceData), &data); err != nil {
			continue
		}

		if _, err := s.sendToDIAN(data, q.Type); err != nil {
			q.RetryCount++
			q.LastError = err.Error()
			s.db.Save(&q)
		} else {
			// Success - delete from queue
			s.db.Delete(&q)
		}
	}

	return nil
}
