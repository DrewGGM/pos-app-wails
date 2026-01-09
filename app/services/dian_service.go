package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png" // Register PNG decoder
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// DIANService handles DIAN electronic invoicing
type DIANService struct {
	db     *gorm.DB
	config *models.DIANConfig
	client *http.Client
}

// NewDIANService creates a new DIAN service instance
func NewDIANService() *DIANService {
	service := &DIANService{
		db:     database.GetDB(),
		client: &http.Client{Timeout: 120 * time.Second}, // 2 minutes for DIAN API calls that may take time
	}
	// Only load config if database is initialized
	if service.db != nil {
		service.loadConfig()
	}
	return service
}

func (s *DIANService) loadConfig() error {
	return s.db.First(&s.config).Error
}

// DIANCompanyConfig represents company configuration for DIAN
type DIANCompanyConfig struct {
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
	MailHost                     string `json:"mail_host"`
	MailPort                     string `json:"mail_port"`
	MailUsername                 string `json:"mail_username"`
	MailPassword                 string `json:"mail_password"`
	MailEncryption               string `json:"mail_encryption"`
}

// ConfigureCompany configures the company in DIAN API
// Automatically loads data from DIANConfig and RestaurantConfig tables
func (s *DIANService) ConfigureCompany() (map[string]interface{}, error) {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found. Please configure DIAN settings first")
	}

	var restaurantConfig models.RestaurantConfig
	if err := s.db.First(&restaurantConfig).Error; err != nil {
		return nil, fmt.Errorf("restaurant configuration not found. Please configure restaurant settings first")
	}

	if dianConfig.IdentificationNumber == "" || dianConfig.DV == "" {
		return nil, fmt.Errorf("NIT and DV are required in DIAN configuration")
	}

	if dianConfig.APIURL == "" {
		return nil, fmt.Errorf("API URL is required in DIAN configuration")
	}

	// Set default merchant registration if empty
	merchantRegistration := dianConfig.MerchantRegistration
	if merchantRegistration == "" {
		merchantRegistration = "0000000-00"
	}

	config := DIANCompanyConfig{
		TypeDocumentIdentificationID: dianConfig.TypeDocumentID,
		TypeOrganizationID:           dianConfig.TypeOrganizationID,
		TypeRegimeID:                 dianConfig.TypeRegimeID,
		TypeLiabilityID:              dianConfig.TypeLiabilityID,
		BusinessName:                 dianConfig.BusinessName,
		MerchantRegistration:         merchantRegistration,
		MunicipalityID:               dianConfig.MunicipalityID,
		Address:                      restaurantConfig.Address,
		Phone:                        restaurantConfig.Phone,
		Email:                        restaurantConfig.Email,
		MailHost:                     dianConfig.EmailHost,
		MailPort:                     fmt.Sprintf("%d", dianConfig.EmailPort),
		MailUsername:                 dianConfig.EmailUsername,
		MailPassword:                 dianConfig.EmailPassword,
		MailEncryption:               dianConfig.EmailEncryption,
	}

	// Build URL: {api_url}/api/ubl2.1/config/{nit}/{dv}
	url := fmt.Sprintf("%s/api/ubl2.1/config/%s/%s",
		dianConfig.APIURL,
		dianConfig.IdentificationNumber,
		dianConfig.DV,
	)

	jsonData, err := json.Marshal(config)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal configuration: %w", err)
	}

	// No authorization required for initial config
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to DIAN API: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// API returns "token" not "api_token"
	token, tokenOk := result["token"].(string)
	if !tokenOk || token == "" {
		token, tokenOk = result["api_token"].(string)
	}

	if tokenOk && token != "" {
		dianConfig.APIToken = token
		dianConfig.Step1Completed = true
		if err := s.db.Save(&dianConfig).Error; err != nil {
			return nil, fmt.Errorf("failed to save API token: %w", err)
		}
		s.config = &dianConfig
	} else {
		return nil, fmt.Errorf("API token not received in response. Response: %s", string(body))
	}

	return result, nil
}

// ConfigureSoftware configures the software in DIAN API
func (s *DIANService) ConfigureSoftware() error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	if dianConfig.SoftwareID == "" || dianConfig.SoftwarePIN == "" {
		return fmt.Errorf("Software ID and PIN are required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/software", dianConfig.APIURL)

	// Convert PIN to integer if numeric
	var pinValue interface{} = dianConfig.SoftwarePIN
	if pin, err := strconv.Atoi(dianConfig.SoftwarePIN); err == nil {
		pinValue = pin
	}

	data := map[string]interface{}{
		"id":  dianConfig.SoftwareID,
		"pin": pinValue,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	dianConfig.Step2Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	s.config = &dianConfig
	return nil
}

// ConfigureCertificate configures the certificate in DIAN API
func (s *DIANService) ConfigureCertificate() error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	if dianConfig.Certificate == "" || dianConfig.CertificatePassword == "" {
		return fmt.Errorf("Certificate and password are required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/certificate", dianConfig.APIURL)

	data := map[string]interface{}{
		"certificate": dianConfig.Certificate,
		"password":    dianConfig.CertificatePassword,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	dianConfig.Step3Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	s.config = &dianConfig

	return nil
}

// ConfigureLogo uploads the company logo to DIAN API
// The logo must be in JPG format. If PNG, it will be converted with white background.
func (s *DIANService) ConfigureLogo() error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	// Get restaurant config for logo
	var restaurantConfig models.RestaurantConfig
	if err := s.db.First(&restaurantConfig).Error; err != nil {
		return fmt.Errorf("restaurant configuration not found")
	}

	if restaurantConfig.Logo == "" {
		return fmt.Errorf("no logo configured. Please upload a logo in restaurant settings first")
	}

	// Convert logo to JPG base64 (handles PNG with transparency)
	logoBase64, err := s.convertLogoToJPGBase64(restaurantConfig.Logo)
	if err != nil {
		return fmt.Errorf("failed to process logo: %w", err)
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/logo", dianConfig.APIURL)

	data := map[string]interface{}{
		"logo": logoBase64,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	fmt.Println("✅ Logo uploaded to DIAN successfully")
	return nil
}

// convertLogoToJPGBase64 converts a logo (PNG or JPG) to JPG base64 format
// PNG images with transparency get a white background
func (s *DIANService) convertLogoToJPGBase64(logoData string) (string, error) {
	// Remove data:image prefix if present
	base64Data := logoData
	isPNG := false

	if strings.Contains(logoData, ",") {
		// Format is "data:image/...;base64,XXXX"
		parts := strings.SplitN(logoData, ",", 2)
		if len(parts) == 2 {
			base64Data = parts[1]
			// Check if it's PNG
			if strings.Contains(parts[0], "png") {
				isPNG = true
			}
		}
	}

	// Decode base64
	imageBytes, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64 logo: %w", err)
	}

	// Decode image
	img, format, err := image.Decode(bytes.NewReader(imageBytes))
	if err != nil {
		return "", fmt.Errorf("failed to decode image: %w", err)
	}

	// Check if PNG by format detection (more reliable than header)
	if format == "png" {
		isPNG = true
	}

	// If PNG or has transparency, convert to JPG with white background
	if isPNG {
		img = s.applyWhiteBackground(img)
	}

	// Encode as JPG
	var jpgBuffer bytes.Buffer
	if err := jpeg.Encode(&jpgBuffer, img, &jpeg.Options{Quality: 90}); err != nil {
		return "", fmt.Errorf("failed to encode as JPG: %w", err)
	}

	// Return pure base64 (no data:image prefix)
	return base64.StdEncoding.EncodeToString(jpgBuffer.Bytes()), nil
}

// applyWhiteBackground applies a white background to an image (for PNG transparency)
func (s *DIANService) applyWhiteBackground(img image.Image) image.Image {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	// Create a new image with white background
	whiteBackground := image.NewRGBA(image.Rect(0, 0, width, height))

	// Fill with white and composite original image
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			originalColor := img.At(bounds.Min.X+x, bounds.Min.Y+y)
			r, g, b, a := originalColor.RGBA()

			// If pixel has any transparency, blend with white background
			if a < 65535 {
				alpha := float64(a) / 65535.0
				r = uint32(float64(r)*alpha + float64(65535)*(1-alpha))
				g = uint32(float64(g)*alpha + float64(65535)*(1-alpha))
				b = uint32(float64(b)*alpha + float64(65535)*(1-alpha))
			}

			whiteBackground.SetRGBA(x, y, color.RGBA{
				R: uint8(r >> 8),
				G: uint8(g >> 8),
				B: uint8(b >> 8),
				A: 255,
			})
		}
	}

	return whiteBackground
}

// ConfigureResolution configures the resolution in DIAN API
func (s *DIANService) ConfigureResolution() error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	// Validate required fields
	if dianConfig.ResolutionNumber == "" {
		return fmt.Errorf("Resolution number is required")
	}
	if dianConfig.ResolutionPrefix == "" {
		return fmt.Errorf("Resolution prefix is required")
	}
	if dianConfig.TechnicalKey == "" {
		return fmt.Errorf("Technical key is required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/resolution", dianConfig.APIURL)

	// Handle zero-value dates by using default test environment dates
	dateFrom := dianConfig.ResolutionDateFrom
	if dateFrom.IsZero() {
		dateFrom = time.Date(2019, 1, 19, 0, 0, 0, 0, time.UTC)
	}

	dateTo := dianConfig.ResolutionDateTo
	if dateTo.IsZero() {
		dateTo = time.Date(2030, 1, 19, 0, 0, 0, 0, time.UTC)
	}

	data := map[string]interface{}{
		"type_document_id":  1, // Invoice
		"prefix":            dianConfig.ResolutionPrefix,
		"resolution":        dianConfig.ResolutionNumber,
		"resolution_date":   dateFrom.Format("2006-01-02"),
		"technical_key":     dianConfig.TechnicalKey,
		"from":              dianConfig.ResolutionFrom,
		"to":                dianConfig.ResolutionTo,
		"generated_to_date": 0, // Always 0 for initial configuration
		"date_from":         dateFrom.Format("2006-01-02"),
		"date_to":           dateTo.Format("2006-01-02"),
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	dianConfig.Step4Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	s.config = &dianConfig

	return nil
}

// ConfigureCreditNoteResolution configures the Credit Note (NC) resolution in DIAN API
func (s *DIANService) ConfigureCreditNoteResolution() error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	// Validate required fields
	if dianConfig.CreditNoteResolutionPrefix == "" {
		return fmt.Errorf("Credit Note resolution prefix is required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/resolution", dianConfig.APIURL)

	data := map[string]interface{}{
		"type_document_id": 4, // Credit Note
		"prefix":           dianConfig.CreditNoteResolutionPrefix,
		"from":             dianConfig.CreditNoteResolutionFrom,
		"to":               dianConfig.CreditNoteResolutionTo,
	}

	// Optionally add resolution number and dates if provided
	if dianConfig.CreditNoteResolutionNumber != "" {
		data["resolution"] = dianConfig.CreditNoteResolutionNumber
	}
	if !dianConfig.CreditNoteResolutionDateFrom.IsZero() {
		data["date_from"] = dianConfig.CreditNoteResolutionDateFrom.Format("2006-01-02")
	}
	if !dianConfig.CreditNoteResolutionDateTo.IsZero() {
		data["date_to"] = dianConfig.CreditNoteResolutionDateTo.Format("2006-01-02")
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	dianConfig.Step5Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	s.config = &dianConfig

	return nil
}

// ConfigureDebitNoteResolution configures the Debit Note (ND) resolution in DIAN API
func (s *DIANService) ConfigureDebitNoteResolution() error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please configure company first (Step 1)")
	}

	// Validate required fields
	if dianConfig.DebitNoteResolutionPrefix == "" {
		return fmt.Errorf("Debit Note resolution prefix is required")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/resolution", dianConfig.APIURL)

	data := map[string]interface{}{
		"type_document_id": 5, // Debit Note
		"prefix":           dianConfig.DebitNoteResolutionPrefix,
		"from":             dianConfig.DebitNoteResolutionFrom,
		"to":               dianConfig.DebitNoteResolutionTo,
	}

	// Optionally add resolution number and dates if provided
	if dianConfig.DebitNoteResolutionNumber != "" {
		data["resolution"] = dianConfig.DebitNoteResolutionNumber
	}
	if !dianConfig.DebitNoteResolutionDateFrom.IsZero() {
		data["date_from"] = dianConfig.DebitNoteResolutionDateFrom.Format("2006-01-02")
	}
	if !dianConfig.DebitNoteResolutionDateTo.IsZero() {
		data["date_to"] = dianConfig.DebitNoteResolutionDateTo.Format("2006-01-02")
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, string(body))
	}

	dianConfig.Step6Completed = true
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save step completion: %w", err)
	}

	s.config = &dianConfig

	return nil
}

// ChangeEnvironment changes between test and production environment
func (s *DIANService) ChangeEnvironment(environment string) error {
	if s.config == nil || s.config.APIToken == "" {
		return fmt.Errorf("DIAN configuration not complete")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/config/environment", s.config.APIURL)

	// Environment IDs: 1=Production, 2=Test
	envID := 2 // Test by default
	if environment == "production" {
		envID = 1
	}

	data := map[string]interface{}{
		"type_environment_id":         envID,
		"payroll_type_environment_id": envID,
		"eqdocs_type_environment_id":  envID,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.config.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("DIAN API error: %s", string(body))
	}

	s.config.Environment = environment

	// Mark step 7 as completed when migrating to production
	if environment == "production" {
		s.config.Step7Completed = true
	}

	s.db.Save(s.config)

	return nil
}

// GetNumberingRanges gets numbering ranges from DIAN
func (s *DIANService) GetNumberingRanges() (map[string]interface{}, error) {
	if s.config == nil || s.config.APIToken == "" {
		return nil, fmt.Errorf("DIAN configuration not complete")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/numbering-range", s.config.APIURL)

	data := map[string]interface{}{
		"IDSoftware": s.config.SoftwareID,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	fmt.Printf("📡 GetNumberingRanges - Request URL: %s\n", url)
	fmt.Printf("📡 GetNumberingRanges - Request Body: %s\n", string(jsonData))

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.config.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		fmt.Printf("❌ GetNumberingRanges - HTTP Error: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	fmt.Printf("📡 GetNumberingRanges - Status Code: %d\n", resp.StatusCode)
	fmt.Printf("📡 GetNumberingRanges - Raw Response:\n%s\n", string(body))

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DIAN API error: %s", string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("❌ GetNumberingRanges - JSON Parse Error: %v\n", err)
		return nil, err
	}

	// Debug: Pretty print the parsed JSON structure
	prettyJSON, _ := json.MarshalIndent(result, "", "  ")
	fmt.Printf("📡 GetNumberingRanges - Parsed JSON Structure:\n%s\n", string(prettyJSON))

	// Debug: Analyze the response structure to help find resolution data
	s.debugAnalyzeNumberingRangesResponse(result)

	return result, nil
}

// debugAnalyzeNumberingRangesResponse analyzes and logs the structure of the numbering ranges response
func (s *DIANService) debugAnalyzeNumberingRangesResponse(result map[string]interface{}) {
	fmt.Println("🔍 Analyzing GetNumberingRanges response structure...")

	// Check top-level keys
	fmt.Printf("🔍 Top-level keys: ")
	for key := range result {
		fmt.Printf("%s, ", key)
	}
	fmt.Println()

	// Check for ResponseDian (typical DIAN SOAP response wrapper)
	if responseDian, ok := result["ResponseDian"].(map[string]interface{}); ok {
		fmt.Println("🔍 Found 'ResponseDian' wrapper")
		s.debugAnalyzeNestedStructure(responseDian, "  ResponseDian")
	}

	// Check for direct resolution data
	if resolutions, ok := result["resolutions"].([]interface{}); ok {
		fmt.Printf("🔍 Found 'resolutions' array with %d elements\n", len(resolutions))
		for i, res := range resolutions {
			if resMap, ok := res.(map[string]interface{}); ok {
				fmt.Printf("🔍 Resolution[%d]: %+v\n", i, resMap)
			}
		}
	}

	// Check for data wrapper
	if data, ok := result["data"].(map[string]interface{}); ok {
		fmt.Println("🔍 Found 'data' wrapper")
		s.debugAnalyzeNestedStructure(data, "  data")
	}

	// Check for message field (often contains status info)
	if message, ok := result["message"].(string); ok {
		fmt.Printf("🔍 Message: %s\n", message)
	}

	// Check for success field
	if success, ok := result["success"].(bool); ok {
		fmt.Printf("🔍 Success: %v\n", success)
	}
}

// debugAnalyzeNestedStructure recursively analyzes nested map structures
func (s *DIANService) debugAnalyzeNestedStructure(data map[string]interface{}, prefix string) {
	for key, value := range data {
		switch v := value.(type) {
		case map[string]interface{}:
			fmt.Printf("%s.%s: (map with %d keys)\n", prefix, key, len(v))
			// Go one level deeper for important keys
			if key == "Envelope" || key == "Body" || key == "GetNumberingRangeResponse" ||
				key == "GetNumberingRangeResult" || key == "DianResponse" || key == "ResponseList" {
				s.debugAnalyzeNestedStructure(v, prefix+"."+key)
			}
		case []interface{}:
			fmt.Printf("%s.%s: (array with %d elements)\n", prefix, key, len(v))
			// If it's a resolution list, print the first element
			if len(v) > 0 {
				if firstMap, ok := v[0].(map[string]interface{}); ok {
					fmt.Printf("%s.%s[0]: %+v\n", prefix, key, firstMap)
				}
			}
		case string:
			// Only print relevant string fields
			if key == "Resolution" || key == "Prefix" || key == "From" || key == "To" ||
				key == "TechnicalKey" || key == "ResolutionDate" || key == "DateFrom" || key == "DateTo" ||
				key == "StatusCode" || key == "StatusDescription" || key == "IsValid" {
				fmt.Printf("%s.%s: %s\n", prefix, key, v)
			}
		case float64:
			if key == "From" || key == "To" {
				fmt.Printf("%s.%s: %.0f\n", prefix, key, v)
			}
		}
	}
}

// ProductionResolutionData represents the data extracted from GetNumberingRanges response
type ProductionResolutionData struct {
	Resolution     string `json:"resolution"`
	Prefix         string `json:"prefix"`
	StartNumber    int    `json:"start_number"`
	EndNumber      int    `json:"end_number"`
	TechnicalKey   string `json:"technical_key"`
	ResolutionDate string `json:"resolution_date"`
	DateFrom       string `json:"date_from"`
	DateTo         string `json:"date_to"`
}

// MigrateToProduction performs the complete migration to production environment
// Automatically extracts resolution data from GetNumberingRanges API response
func (s *DIANService) MigrateToProduction() error {
	if s.config == nil || s.config.APIToken == "" {
		return fmt.Errorf("DIAN configuration not complete")
	}

	fmt.Println("🚀 Starting production migration...")

	// Step 1: Change environment to production
	fmt.Println("📍 Step 1: Changing environment to production...")
	if err := s.ChangeEnvironment("production"); err != nil {
		return fmt.Errorf("failed to change environment to production: %w", err)
	}

	// Step 2: Get numbering ranges from DIAN (this returns the production resolution data)
	fmt.Println("📍 Step 2: Getting numbering ranges from DIAN...")
	numberingRanges, err := s.GetNumberingRanges()
	if err != nil {
		return fmt.Errorf("failed to get numbering ranges: %w", err)
	}

	// Step 3: Extract resolution data from the response
	fmt.Println("📍 Step 3: Extracting resolution data from response...")
	resolutionData, err := s.extractResolutionFromNumberingRanges(numberingRanges)
	if err != nil {
		return fmt.Errorf("failed to extract resolution data: %w", err)
	}

	// Step 4: Update configuration with extracted resolution data
	fmt.Println("📍 Step 4: Updating configuration with resolution data...")
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	// Set production resolution values from extracted data
	dianConfig.ResolutionNumber = resolutionData.Resolution
	dianConfig.ResolutionPrefix = resolutionData.Prefix
	dianConfig.ResolutionFrom = resolutionData.StartNumber
	dianConfig.ResolutionTo = resolutionData.EndNumber
	dianConfig.TechnicalKey = resolutionData.TechnicalKey
	dianConfig.LastInvoiceNumber = resolutionData.StartNumber - 1 // Start at one less than first number

	// Parse dates using local timezone to avoid UTC conversion issues
	if resolutionData.ResolutionDate != "" {
		if t, err := time.ParseInLocation("2006-01-02", resolutionData.ResolutionDate, time.Local); err == nil {
			dianConfig.ResolutionDateFrom = t
		}
	}
	if resolutionData.DateFrom != "" {
		if t, err := time.ParseInLocation("2006-01-02", resolutionData.DateFrom, time.Local); err == nil {
			dianConfig.ResolutionDateFrom = t
		}
	}
	if resolutionData.DateTo != "" {
		if t, err := time.ParseInLocation("2006-01-02", resolutionData.DateTo, time.Local); err == nil {
			dianConfig.ResolutionDateTo = t
		}
	}

	// Disable test mode since we're in production
	dianConfig.UseTestSetID = false
	dianConfig.Step7Completed = true

	// Save updated configuration
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save production configuration: %w", err)
	}

	s.config = &dianConfig

	// Step 5: Register the production resolution with DIAN API
	fmt.Println("📍 Step 5: Registering production resolution with DIAN API...")
	if err := s.ConfigureResolution(); err != nil {
		return fmt.Errorf("failed to configure production resolution: %w", err)
	}

	fmt.Printf("✅ Production migration completed successfully:\n")
	fmt.Printf("   Resolution: %s\n", resolutionData.Resolution)
	fmt.Printf("   Prefix: %s\n", resolutionData.Prefix)
	fmt.Printf("   Range: %d - %d\n", resolutionData.StartNumber, resolutionData.EndNumber)
	fmt.Printf("   Technical Key: %s\n", resolutionData.TechnicalKey)
	fmt.Printf("   Valid From: %s To: %s\n", resolutionData.DateFrom, resolutionData.DateTo)

	return nil
}

// extractResolutionFromNumberingRanges extracts resolution data from GetNumberingRanges response
// Response structure: ResponseDian.Envelope.Body.GetNumberingRangeResponse.GetNumberingRangeResult.ResponseList.NumberRangeResponse
func (s *DIANService) extractResolutionFromNumberingRanges(response map[string]interface{}) (*ProductionResolutionData, error) {
	fmt.Println("🔍 Extracting resolution from GetNumberingRanges response...")

	// Navigate the nested structure:
	// ResponseDian -> Envelope -> Body -> GetNumberingRangeResponse -> GetNumberingRangeResult -> ResponseList -> NumberRangeResponse
	responseDian, ok := response["ResponseDian"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("ResponseDian not found in response")
	}

	envelope, ok := responseDian["Envelope"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("Envelope not found in ResponseDian")
	}

	body, ok := envelope["Body"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("Body not found in Envelope")
	}

	getNumberingRangeResponse, ok := body["GetNumberingRangeResponse"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("GetNumberingRangeResponse not found in Body")
	}

	getNumberingRangeResult, ok := getNumberingRangeResponse["GetNumberingRangeResult"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("GetNumberingRangeResult not found in GetNumberingRangeResponse")
	}

	// Check operation status
	if opCode, ok := getNumberingRangeResult["OperationCode"].(string); ok {
		fmt.Printf("🔍 OperationCode: %s\n", opCode)
		if opCode != "100" {
			opDesc, _ := getNumberingRangeResult["OperationDescription"].(string)
			return nil, fmt.Errorf("DIAN operation failed: %s - %s", opCode, opDesc)
		}
	}

	responseList, ok := getNumberingRangeResult["ResponseList"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("ResponseList not found in GetNumberingRangeResult")
	}

	// NumberRangeResponse can be a single object or an array
	var numberRangeResponse map[string]interface{}

	if nrr, ok := responseList["NumberRangeResponse"].(map[string]interface{}); ok {
		// Single resolution
		numberRangeResponse = nrr
	} else if nrrArray, ok := responseList["NumberRangeResponse"].([]interface{}); ok && len(nrrArray) > 0 {
		// Multiple resolutions - take the first one (or we could let user choose)
		if firstRes, ok := nrrArray[0].(map[string]interface{}); ok {
			numberRangeResponse = firstRes
		}
	}

	if numberRangeResponse == nil {
		return nil, fmt.Errorf("NumberRangeResponse not found or empty in ResponseList")
	}

	fmt.Printf("🔍 Found NumberRangeResponse: %+v\n", numberRangeResponse)

	// Extract resolution data
	resolutionData := &ProductionResolutionData{}

	// ResolutionNumber
	if val, ok := numberRangeResponse["ResolutionNumber"].(string); ok {
		resolutionData.Resolution = val
		fmt.Printf("   ✅ ResolutionNumber: %s\n", val)
	} else {
		return nil, fmt.Errorf("ResolutionNumber not found in response")
	}

	// Prefix
	if val, ok := numberRangeResponse["Prefix"].(string); ok {
		resolutionData.Prefix = val
		fmt.Printf("   ✅ Prefix: %s\n", val)
	} else {
		return nil, fmt.Errorf("Prefix not found in response")
	}

	// FromNumber (can be string or number)
	if val, ok := numberRangeResponse["FromNumber"].(string); ok {
		if num, err := strconv.Atoi(val); err == nil {
			resolutionData.StartNumber = num
			fmt.Printf("   ✅ FromNumber: %d\n", num)
		}
	} else if val, ok := numberRangeResponse["FromNumber"].(float64); ok {
		resolutionData.StartNumber = int(val)
		fmt.Printf("   ✅ FromNumber: %d\n", resolutionData.StartNumber)
	}
	if resolutionData.StartNumber == 0 {
		return nil, fmt.Errorf("FromNumber not found or invalid in response")
	}

	// ToNumber (can be string or number)
	if val, ok := numberRangeResponse["ToNumber"].(string); ok {
		if num, err := strconv.Atoi(val); err == nil {
			resolutionData.EndNumber = num
			fmt.Printf("   ✅ ToNumber: %d\n", num)
		}
	} else if val, ok := numberRangeResponse["ToNumber"].(float64); ok {
		resolutionData.EndNumber = int(val)
		fmt.Printf("   ✅ ToNumber: %d\n", resolutionData.EndNumber)
	}
	if resolutionData.EndNumber == 0 {
		return nil, fmt.Errorf("ToNumber not found or invalid in response")
	}

	// TechnicalKey (optional for some document types)
	if val, ok := numberRangeResponse["TechnicalKey"].(string); ok {
		resolutionData.TechnicalKey = val
		fmt.Printf("   ✅ TechnicalKey: %s\n", val)
	}

	// ResolutionDate
	if val, ok := numberRangeResponse["ResolutionDate"].(string); ok {
		resolutionData.ResolutionDate = val
		fmt.Printf("   ✅ ResolutionDate: %s\n", val)
	}

	// ValidDateFrom
	if val, ok := numberRangeResponse["ValidDateFrom"].(string); ok {
		resolutionData.DateFrom = val
		fmt.Printf("   ✅ ValidDateFrom: %s\n", val)
	}

	// ValidDateTo
	if val, ok := numberRangeResponse["ValidDateTo"].(string); ok {
		resolutionData.DateTo = val
		fmt.Printf("   ✅ ValidDateTo: %s\n", val)
	}

	fmt.Println("✅ Resolution data extracted successfully!")
	return resolutionData, nil
}

// updateConfigFromResolution updates DIAN config from resolution data
// Note: This function is kept for backwards compatibility but is no longer used by MigrateToProduction
// since production resolution data is now provided by the user directly
func (s *DIANService) updateConfigFromResolution(config *models.DIANConfig, data map[string]interface{}) {
	fmt.Println("🔧 updateConfigFromResolution - Attempting to extract values from data...")
	fmt.Printf("🔧 Data received: %+v\n", data)

	// List all keys in the data for debugging
	fmt.Printf("🔧 Available keys: ")
	for key := range data {
		fmt.Printf("'%s', ", key)
	}
	fmt.Println()

	// Extract prefix - try multiple possible key names
	prefixFound := false
	for _, key := range []string{"prefix", "Prefix", "PREFIX"} {
		if prefix, ok := data[key].(string); ok && prefix != "" {
			config.ResolutionPrefix = prefix
			fmt.Printf("✅ Found prefix '%s' = '%s'\n", key, prefix)
			prefixFound = true
			break
		}
	}
	if !prefixFound {
		fmt.Println("⚠️ Prefix not found in data")
	}

	// Extract resolution number - try multiple possible key names
	resolutionFound := false
	for _, key := range []string{"resolution", "Resolution", "RESOLUTION", "ResolutionNumber", "resolution_number"} {
		if resolution, ok := data[key].(string); ok && resolution != "" {
			config.ResolutionNumber = resolution
			fmt.Printf("✅ Found resolution '%s' = '%s'\n", key, resolution)
			resolutionFound = true
			break
		}
	}
	if !resolutionFound {
		fmt.Println("⚠️ Resolution number not found in data")
	}

	// Extract technical key - try multiple possible key names
	techKeyFound := false
	for _, key := range []string{"technical_key", "TechnicalKey", "technicalKey", "TECHNICALKEY"} {
		if technicalKey, ok := data[key].(string); ok && technicalKey != "" {
			config.TechnicalKey = technicalKey
			fmt.Printf("✅ Found technical_key '%s' = '%s'\n", key, technicalKey)
			techKeyFound = true
			break
		}
	}
	if !techKeyFound {
		fmt.Println("⚠️ Technical key not found in data")
	}

	// Extract from number - try multiple possible key names and types
	fromFound := false
	for _, key := range []string{"from", "From", "FROM", "FromNumber", "from_number"} {
		if from, ok := data[key].(float64); ok {
			config.ResolutionFrom = int(from)
			fmt.Printf("✅ Found from '%s' = %d (as float64)\n", key, config.ResolutionFrom)
			fromFound = true
			break
		} else if from, ok := data[key].(string); ok && from != "" {
			if val, err := strconv.Atoi(from); err == nil {
				config.ResolutionFrom = val
				fmt.Printf("✅ Found from '%s' = %d (as string)\n", key, val)
				fromFound = true
				break
			}
		}
	}
	if !fromFound {
		fmt.Println("⚠️ From number not found in data")
	}

	// Extract to number - try multiple possible key names and types
	toFound := false
	for _, key := range []string{"to", "To", "TO", "ToNumber", "to_number"} {
		if to, ok := data[key].(float64); ok {
			config.ResolutionTo = int(to)
			fmt.Printf("✅ Found to '%s' = %d (as float64)\n", key, config.ResolutionTo)
			toFound = true
			break
		} else if to, ok := data[key].(string); ok && to != "" {
			if val, err := strconv.Atoi(to); err == nil {
				config.ResolutionTo = val
				fmt.Printf("✅ Found to '%s' = %d (as string)\n", key, val)
				toFound = true
				break
			}
		}
	}
	if !toFound {
		fmt.Println("⚠️ To number not found in data")
	}

	// Extract dates - try multiple possible key names
	for _, key := range []string{"date_from", "DateFrom", "dateFrom", "ResolutionDate", "resolution_date"} {
		if dateFrom, ok := data[key].(string); ok && dateFrom != "" {
			if t, err := time.Parse("2006-01-02", dateFrom); err == nil {
				config.ResolutionDateFrom = t
				fmt.Printf("✅ Found date_from '%s' = '%s'\n", key, dateFrom)
				break
			}
		}
	}

	for _, key := range []string{"date_to", "DateTo", "dateTo", "ExpirationDate", "expiration_date"} {
		if dateTo, ok := data[key].(string); ok && dateTo != "" {
			if t, err := time.Parse("2006-01-02", dateTo); err == nil {
				config.ResolutionDateTo = t
				fmt.Printf("✅ Found date_to '%s' = '%s'\n", key, dateTo)
				break
			}
		}
	}

	fmt.Printf("🔧 updateConfigFromResolution - Final config values:\n")
	fmt.Printf("   ResolutionNumber: %s\n", config.ResolutionNumber)
	fmt.Printf("   ResolutionPrefix: %s\n", config.ResolutionPrefix)
	fmt.Printf("   ResolutionFrom: %d\n", config.ResolutionFrom)
	fmt.Printf("   ResolutionTo: %d\n", config.ResolutionTo)
	fmt.Printf("   TechnicalKey: %s\n", config.TechnicalKey)
}

// GetDIANConfig returns current DIAN configuration
func (s *DIANService) GetDIANConfig() (*models.DIANConfig, error) {
	if s.config == nil {
		s.loadConfig()
	}
	if s.config == nil {
		// Create default config if not exists
		s.config = &models.DIANConfig{
			Environment:  "test",
			IsEnabled:    false,
			UseTestSetID: true, // Default to true for test mode
		}
		s.db.Create(s.config)
	}
	return s.config, nil
}

// UpdateDIANConfig updates DIAN configuration
func (s *DIANService) UpdateDIANConfig(config *models.DIANConfig) error {
	// Debug: Log the values being saved
	fmt.Printf("💾 Saving DIAN Config - ID: %d, UseTestSetID: %v, TestSetID: %s, Environment: %s\n",
		config.ID, config.UseTestSetID, config.TestSetID, config.Environment)

	if err := s.db.Save(config).Error; err != nil {
		return err
	}
	s.config = config
	fmt.Printf("✅ DIAN Config saved successfully - UseTestSetID: %v\n", config.UseTestSetID)
	return nil
}

// ResetConfigurationSteps resets all DIAN configuration steps to false
// This does NOT delete any data, only resets the step completion flags
func (s *DIANService) ResetConfigurationSteps() error {
	var config models.DIANConfig
	if err := s.db.First(&config).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found: %w", err)
	}

	// Reset all step completion flags
	config.Step1Completed = false
	config.Step2Completed = false
	config.Step3Completed = false
	config.Step4Completed = false
	config.Step5Completed = false
	config.Step6Completed = false
	config.Step7Completed = false

	if err := s.db.Save(&config).Error; err != nil {
		return fmt.Errorf("failed to reset configuration steps: %w", err)
	}

	// Update service config cache
	s.config = &config

	fmt.Printf("🔄 DIAN Configuration steps have been reset\n")
	return nil
}

// TestConnection tests the connection to DIAN API
func (s *DIANService) TestConnection() error {
	if s.config == nil || s.config.APIURL == "" {
		return fmt.Errorf("DIAN API URL not configured")
	}

	req, err := http.NewRequest("GET", s.config.APIURL, nil)
	if err != nil {
		return err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}

// ==================== DIAN INVOICE STRUCTURES ====================

// DIANInvoiceCustomer represents the customer in a DIAN invoice
type DIANInvoiceCustomer struct {
	IdentificationNumber       int    `json:"identification_number"`
	DV                         string `json:"dv"`
	Name                       string `json:"name"`
	Phone                      string `json:"phone"`
	Address                    string `json:"address"`
	Email                      string `json:"email"`
	MerchantRegistration       string `json:"merchant_registration"`
	TypeDocumentIdentificationID int  `json:"type_document_identification_id"`
	TypeOrganizationID         int    `json:"type_organization_id"`
	TypeLiabilityID            int    `json:"type_liability_id"`
	MunicipalityID             int    `json:"municipality_id"`
	TypeRegimeID               int    `json:"type_regime_id"`
	TaxID                      *int   `json:"tax_id,omitempty"`
}

// DIANInvoicePaymentForm represents the payment form in a DIAN invoice
type DIANInvoicePaymentForm struct {
	PaymentFormID    int    `json:"payment_form_id"`
	PaymentMethodID  int    `json:"payment_method_id"`
	PaymentDueDate   string `json:"payment_due_date"`
	DurationMeasure  string `json:"duration_measure"`
}

// DIANInvoiceLegalMonetaryTotals represents the legal monetary totals
type DIANInvoiceLegalMonetaryTotals struct {
	LineExtensionAmount  string `json:"line_extension_amount"`
	TaxExclusiveAmount   string `json:"tax_exclusive_amount"`
	TaxInclusiveAmount   string `json:"tax_inclusive_amount"`
	AllowanceTotalAmount string `json:"allowance_total_amount,omitempty"`
	PayableAmount        string `json:"payable_amount"`
}

// DIANInvoiceTaxTotal represents a tax total
type DIANInvoiceTaxTotal struct {
	TaxID         int    `json:"tax_id"`
	TaxAmount     string `json:"tax_amount"`
	Percent       string `json:"percent"`
	TaxableAmount string `json:"taxable_amount"`
}

// DIANInvoiceLine represents an invoice line
type DIANInvoiceLine struct {
	UnitMeasureID          int                   `json:"unit_measure_id"`
	InvoicedQuantity       string                `json:"invoiced_quantity"`
	LineExtensionAmount    string                `json:"line_extension_amount"`
	FreeOfChargeIndicator  bool                  `json:"free_of_charge_indicator"`
	TaxTotals              []DIANInvoiceTaxTotal `json:"tax_totals"`
	Description            string                `json:"description"`
	Notes                  string                `json:"notes,omitempty"`
	Code                   string                `json:"code"`
	TypeItemIdentificationID int                 `json:"type_item_identification_id"`
	PriceAmount            string                `json:"price_amount"`
	BaseQuantity           string                `json:"base_quantity"`
}

// DIANInvoiceAllowanceCharge represents a discount or charge
type DIANInvoiceAllowanceCharge struct {
	DiscountID            int    `json:"discount_id,omitempty"`
	ChargeIndicator       bool   `json:"charge_indicator"`
	AllowanceChargeReason string `json:"allowance_charge_reason"`
	Amount                string `json:"amount"`
	BaseAmount            string `json:"base_amount"`
}

// DIANInvoice represents a complete DIAN electronic invoice
type DIANInvoice struct {
	Number                    int                              `json:"number"`
	TypeDocumentID            int                              `json:"type_document_id"`
	Date                      string                           `json:"date"`
	Time                      string                           `json:"time"`
	ResolutionNumber          string                           `json:"resolution_number"`
	Prefix                    string                           `json:"prefix"`
	Notes                     string                           `json:"notes,omitempty"`
	DisableConfirmationText   bool                             `json:"disable_confirmation_text,omitempty"`
	EstablishmentName         string                           `json:"establishment_name"`
	EstablishmentAddress      string                           `json:"establishment_address"`
	EstablishmentPhone        string                           `json:"establishment_phone"`
	EstablishmentMunicipality int                              `json:"establishment_municipality"`
	EstablishmentEmail        string                           `json:"establishment_email,omitempty"`
	SendMail                  bool                             `json:"sendmail,omitempty"`
	SendMailToMe              bool                             `json:"sendmailtome,omitempty"`
	HeadNote                  string                           `json:"head_note,omitempty"`
	FootNote                  string                           `json:"foot_note,omitempty"`
	Customer                  DIANInvoiceCustomer              `json:"customer"`
	PaymentForm               interface{}                      `json:"payment_form"` // Can be single object or array
	LegalMonetaryTotals       DIANInvoiceLegalMonetaryTotals   `json:"legal_monetary_totals"`
	TaxTotals                 []DIANInvoiceTaxTotal            `json:"tax_totals"`
	InvoiceLines              []DIANInvoiceLine                `json:"invoice_lines"`
	AllowanceCharges          []DIANInvoiceAllowanceCharge     `json:"allowance_charges,omitempty"`
}

// DIANInvoiceResponse represents the response from DIAN API when sending an invoice
type DIANInvoiceResponse struct {
	Success          bool   `json:"success"`
	Message          string `json:"message"`
	ResponseDian     interface{} `json:"ResponseDian,omitempty"`
	ZipKey           string `json:"zip_key,omitempty"`
	UUID             string `json:"uuid,omitempty"`
	CUFE             string `json:"cufe,omitempty"`
	IssueDate        string `json:"issue_date,omitempty"`
	Number           string `json:"number,omitempty"`
	ErrorMessages    []string `json:"errors,omitempty"`
}

// SendInvoice sends an electronic invoice to DIAN
func (s *DIANService) SendInvoice(invoice *DIANInvoice) (*DIANInvoiceResponse, error) {
	// Load config
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found")
	}

	// Validate configuration
	if dianConfig.APIToken == "" {
		return nil, fmt.Errorf("API token not found. Please complete DIAN configuration steps first")
	}

	if !dianConfig.IsEnabled {
		return nil, fmt.Errorf("DIAN electronic invoicing is not enabled")
	}

	// Build URL based on environment and UseTestSetID flag
	var url string
	if dianConfig.Environment == "test" && dianConfig.UseTestSetID {
		// In test mode with UseTestSetID enabled, include test_set_id
		if dianConfig.TestSetID == "" {
			return nil, fmt.Errorf("test set ID not configured for test environment")
		}
		url = fmt.Sprintf("%s/api/ubl2.1/invoice/%s", dianConfig.APIURL, dianConfig.TestSetID)
	} else {
		// In production mode or test without test_set_id, no test_set_id in URL
		url = fmt.Sprintf("%s/api/ubl2.1/invoice", dianConfig.APIURL)
	}

	// Marshal invoice to JSON
	jsonData, err := json.Marshal(invoice)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal invoice: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send invoice: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Parse response
	var invoiceResp DIANInvoiceResponse
	if err := json.Unmarshal(body, &invoiceResp); err != nil {
		return nil, fmt.Errorf("failed to parse response (status %d): %s", resp.StatusCode, string(body))
	}

	// Check for errors
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		if len(invoiceResp.ErrorMessages) > 0 {
			return &invoiceResp, fmt.Errorf("DIAN API error (status %d): %v", resp.StatusCode, invoiceResp.ErrorMessages)
		}
		return &invoiceResp, fmt.Errorf("DIAN API error (status %d): %s", resp.StatusCode, invoiceResp.Message)
	}

	// Update consecutive number if invoice was sent successfully
	if invoiceResp.Success {
		dianConfig.LastInvoiceNumber = invoice.Number
		if err := s.db.Save(&dianConfig).Error; err != nil {
			// Log error but don't fail the invoice send
			fmt.Printf("Warning: failed to update consecutive number: %v\n", err)
		}
	}

	return &invoiceResp, nil
}

// ResendInvoiceEmail resends the invoice email to the customer
// Uses the DIAN API endpoint: POST /api/send-email-employee/NO
func (s *DIANService) ResendInvoiceEmail(prefix string, invoiceNumber string) error {
	// Load config
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please complete DIAN configuration first")
	}

	// Build URL: {api_url}/api/send-email-employee/NO
	url := fmt.Sprintf("%s/api/send-email-employee/NO", dianConfig.APIURL)

	data := map[string]interface{}{
		"company_idnumber": dianConfig.IdentificationNumber,
		"prefix":           prefix,
		"number":           invoiceNumber,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	fmt.Printf("✅ Invoice email resent successfully: %s%s\n", prefix, invoiceNumber)
	return nil
}

// NextConsecutiveResponse represents the response from the next-consecutive API
type NextConsecutiveResponse struct {
	Success        bool   `json:"success"`
	TypeDocumentID int    `json:"type_document_id"`
	Prefix         string `json:"prefix"`
	Number         int    `json:"number"`
}

// GetNextConsecutive gets the next consecutive number from DIAN API
func (s *DIANService) GetNextConsecutive(typeDocumentID int, prefix string) (*NextConsecutiveResponse, error) {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return nil, fmt.Errorf("API token not found. Please complete DIAN configuration first")
	}

	url := fmt.Sprintf("%s/api/ubl2.1/next-consecutive", dianConfig.APIURL)

	data := map[string]interface{}{
		"type_document_id": typeDocumentID,
		"prefix":           prefix,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", dianConfig.APIToken))

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result NextConsecutiveResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	fmt.Printf("✅ Next consecutive fetched: prefix=%s, number=%d\n", result.Prefix, result.Number)
	return &result, nil
}

// ResetTestResolution resets the resolution to default test values
func (s *DIANService) ResetTestResolution() error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	// Default test resolution values (date should be 19th, not 16th)
	dianConfig.ResolutionNumber = "18760000001"
	dianConfig.ResolutionPrefix = "SETP"
	dianConfig.ResolutionFrom = 990000000
	dianConfig.ResolutionTo = 995000000
	dianConfig.TechnicalKey = "fc8eac422eba16e22ffd8c6f94b3f40a6e38162c"
	dianConfig.ResolutionDateFrom, _ = time.Parse("2006-01-02", "2019-01-19")
	dianConfig.ResolutionDateTo, _ = time.Parse("2006-01-02", "2030-01-19")
	dianConfig.LastInvoiceNumber = 0
	dianConfig.Environment = "test"
	dianConfig.Step4Completed = false
	dianConfig.Step7Completed = false

	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save configuration: %w", err)
	}

	fmt.Println("✅ Test resolution reset to default values")
	return nil
}

// RegisterNewResolution registers the current resolution with DIAN API and updates consecutive
func (s *DIANService) RegisterNewResolution() error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	if dianConfig.APIToken == "" {
		return fmt.Errorf("API token not found. Please complete DIAN configuration first")
	}

	// Get next consecutive from API
	typeDocID := 1 // Invoice type
	nextConsec, err := s.GetNextConsecutive(typeDocID, dianConfig.ResolutionPrefix)
	if err != nil {
		return fmt.Errorf("failed to get next consecutive: %w", err)
	}

	// Update consecutive number
	dianConfig.LastInvoiceNumber = nextConsec.Number - 1 // -1 because next will increment

	// Now configure the resolution with DIAN API
	if err := s.ConfigureResolution(); err != nil {
		return fmt.Errorf("failed to configure resolution: %w", err)
	}

	// Save updated config
	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save configuration: %w", err)
	}

	fmt.Printf("✅ New resolution registered. Next consecutive: %d\n", nextConsec.Number)
	return nil
}

// ResolutionLimitStatus represents the status of resolution invoice numbering limits
type ResolutionLimitStatus struct {
	RemainingInvoices int  `json:"remaining_invoices"`
	AlertThreshold    int  `json:"alert_threshold"`
	IsNearLimit       bool `json:"is_near_limit"`
	CurrentNumber     int  `json:"current_number"`
	EndNumber         int  `json:"end_number"`
}

// GetResolutionLimitStatus returns the current resolution limit status for notifications
func (s *DIANService) GetResolutionLimitStatus() (*ResolutionLimitStatus, error) {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return nil, fmt.Errorf("DIAN configuration not found")
	}

	remaining := dianConfig.ResolutionTo - dianConfig.LastInvoiceNumber
	if remaining < 0 {
		remaining = 0
	}

	threshold := dianConfig.InvoiceLimitAlertThreshold
	if threshold == 0 {
		threshold = 100 // Default
	}

	return &ResolutionLimitStatus{
		RemainingInvoices: remaining,
		AlertThreshold:    threshold,
		IsNearLimit:       remaining <= threshold,
		CurrentNumber:     dianConfig.LastInvoiceNumber,
		EndNumber:         dianConfig.ResolutionTo,
	}, nil
}

// UpdateAlertThreshold updates the invoice limit alert threshold
func (s *DIANService) UpdateAlertThreshold(threshold int) error {
	var dianConfig models.DIANConfig
	if err := s.db.First(&dianConfig).Error; err != nil {
		return fmt.Errorf("DIAN configuration not found")
	}

	dianConfig.InvoiceLimitAlertThreshold = threshold

	if err := s.db.Save(&dianConfig).Error; err != nil {
		return fmt.Errorf("failed to save configuration: %w", err)
	}

	fmt.Printf("✅ Alert threshold updated to: %d\n", threshold)
	return nil
}
