package services

import (
	"PosApp/app/database"
	"PosApp/app/models"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// EmployeeService handles employee and cash register operations
type EmployeeService struct {
	db         *gorm.DB
	printerSvc *PrinterService
}

// NewEmployeeService creates a new employee service
func NewEmployeeService() *EmployeeService {
	return &EmployeeService{
		db:         database.GetDB(),
		printerSvc: NewPrinterService(),
	}
}

// Employee Management

// GetEmployees gets all employees (active and inactive)
func (s *EmployeeService) GetEmployees() ([]models.Employee, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var employees []models.Employee
	err := s.db.Find(&employees).Error
	return employees, err
}

// GetEmployee gets an employee by ID
func (s *EmployeeService) GetEmployee(id uint) (*models.Employee, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var employee models.Employee
	err := s.db.First(&employee, id).Error
	return &employee, err
}

// CreateEmployee creates a new employee
func (s *EmployeeService) CreateEmployee(employee *models.Employee, password string, pin string) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	// Validate password
	if password == "" {
		return fmt.Errorf("password is required")
	}
	if len(password) < 4 {
		return fmt.Errorf("password must be at least 4 characters")
	}

	// Validate PIN
	if pin == "" {
		return fmt.Errorf("PIN is required")
	}
	if len(pin) < 4 {
		return fmt.Errorf("PIN must be at least 4 digits")
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	employee.Password = string(hashedPassword)

	// Hash PIN
	hashedPIN, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash PIN: %w", err)
	}
	employee.PIN = string(hashedPIN)

	return s.db.Create(employee).Error
}

// UpdateEmployee updates an employee
func (s *EmployeeService) UpdateEmployee(employee *models.Employee) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.Save(employee).Error
}

// UpdateEmployeePassword updates an employee's password
func (s *EmployeeService) UpdateEmployeePassword(employeeID uint, newPassword string) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return s.db.Model(&models.Employee{}).Where("id = ?", employeeID).
		Update("password", string(hashedPassword)).Error
}

// UpdateEmployeePIN updates an employee's PIN
func (s *EmployeeService) UpdateEmployeePIN(employeeID uint, newPIN string) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	hashedPIN, err := bcrypt.GenerateFromPassword([]byte(newPIN), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return s.db.Model(&models.Employee{}).Where("id = ?", employeeID).
		Update("pin", string(hashedPIN)).Error
}

// DeleteEmployee soft deletes an employee
func (s *EmployeeService) DeleteEmployee(id uint) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.Delete(&models.Employee{}, id).Error
}

// AuthenticateEmployee authenticates an employee by username and password
func (s *EmployeeService) AuthenticateEmployee(username, password string) (*models.Employee, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var employee models.Employee

	// Find employee
	if err := s.db.Where("username = ? AND is_active = ?", username, true).First(&employee).Error; err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	// Check password
	if err := bcrypt.CompareHashAndPassword([]byte(employee.Password), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	// Update last login
	now := time.Now()
	employee.LastLoginAt = &now
	s.db.Save(&employee)

	return &employee, nil
}

// AuthenticateEmployeeByPIN authenticates an employee by PIN
func (s *EmployeeService) AuthenticateEmployeeByPIN(pin string) (*models.Employee, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var employees []models.Employee

	// Get all active employees
	if err := s.db.Where("is_active = ?", true).Find(&employees).Error; err != nil {
		return nil, err
	}

	// Check PIN for each employee
	for _, employee := range employees {
		if err := bcrypt.CompareHashAndPassword([]byte(employee.PIN), []byte(pin)); err == nil {
			// Update last login
			now := time.Now()
			employee.LastLoginAt = &now
			s.db.Save(&employee)
			return &employee, nil
		}
	}

	return nil, fmt.Errorf("invalid PIN")
}

// DeactivateEmployee deactivates an employee
func (s *EmployeeService) DeactivateEmployee(id uint) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.Model(&models.Employee{}).Where("id = ?", id).Update("is_active", false).Error
}

// Cash Register Management

// OpenCashRegister opens a new cash register session
func (s *EmployeeService) OpenCashRegister(employeeID uint, openingAmount float64, notes string) (*models.CashRegister, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	// Check if employee already has an open register
	var existingRegister models.CashRegister
	err := s.db.Where("employee_id = ? AND status = ?", employeeID, "open").First(&existingRegister).Error
	if err == nil {
		return nil, fmt.Errorf("employee already has an open cash register")
	}

	// Create new cash register
	register := &models.CashRegister{
		EmployeeID:    employeeID,
		OpeningAmount: openingAmount,
		Status:        "open",
		Notes:         notes,
		OpenedAt:      time.Now(),
	}

	if err := s.db.Create(register).Error; err != nil {
		return nil, err
	}

	// Create opening movement
	movement := models.CashMovement{
		CashRegisterID: register.ID,
		Type:           "deposit",
		Amount:         openingAmount,
		Description:    "Apertura de caja",
		Reference:      "OPENING",
		EmployeeID:     employeeID,
	}
	s.db.Create(&movement)

	return register, nil
}

// GetOpenCashRegister gets the open cash register for an employee
func (s *EmployeeService) GetOpenCashRegister(employeeID uint) (*models.CashRegister, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var register models.CashRegister

	err := s.db.Preload("Employee").
		Preload("Movements.Employee").
		Where("employee_id = ? AND status = ?", employeeID, "open").
		First(&register).Error

	if err != nil {
		return nil, fmt.Errorf("no open cash register found")
	}

	// Calculate expected amount
	expectedAmount := s.calculateExpectedCash(&register)
	register.ExpectedAmount = &expectedAmount

	return &register, nil
}

// GetCurrentCashRegister gets the current open cash register (any employee)
func (s *EmployeeService) GetCurrentCashRegister() (*models.CashRegister, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var register models.CashRegister

	err := s.db.Preload("Employee").
		Where("status = ?", "open").
		Order("opened_at DESC").
		First(&register).Error

	if err != nil {
		return nil, fmt.Errorf("no open cash register found")
	}

	return &register, nil
}

// CloseCashRegister closes a cash register session
func (s *EmployeeService) CloseCashRegister(registerID uint, closingAmount float64, notes string) (*models.CashRegisterReport, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var register models.CashRegister

	// Get register with all related data
	if err := s.db.Preload("Movements").Preload("Employee").First(&register, registerID).Error; err != nil {
		return nil, fmt.Errorf("cash register not found")
	}

	if register.Status == "closed" {
		return nil, fmt.Errorf("cash register already closed")
	}

	// Calculate expected amount
	expectedAmount := s.calculateExpectedCash(&register)
	difference := closingAmount - expectedAmount

	// Update register
	now := time.Now()
	register.ClosingAmount = &closingAmount
	register.ExpectedAmount = &expectedAmount
	register.Difference = &difference
	register.Status = "closed"
	register.ClosedAt = &now
	register.Notes = fmt.Sprintf("%s\nCierre: %s", register.Notes, notes)

	if err := s.db.Save(&register).Error; err != nil {
		return nil, err
	}

	// Generate report
	report, err := s.generateCashRegisterReport(&register)
	if err != nil {
		return nil, err
	}

	// Print report
	go s.printerSvc.PrintCashRegisterReport(report)

	// Send report to Google Sheets if enabled
	go func() {
		googleSheetsService := NewGoogleSheetsService(s.db)
		if googleSheetsService != nil {
			if err := googleSheetsService.SyncNow(); err != nil {
				// Log error but don't fail the cash register close
				fmt.Printf("Failed to send report to Google Sheets: %v\n", err)
			}
		}
	}()

	return report, nil
}

// PrintCurrentCashRegisterReport generates and prints a current cash register report without closing
func (s *EmployeeService) PrintCurrentCashRegisterReport(registerID uint) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	var register models.CashRegister

	// Get register with all related data
	if err := s.db.Preload("Movements").Preload("Employee").First(&register, registerID).Error; err != nil {
		return fmt.Errorf("cash register not found")
	}

	if register.Status != "open" {
		return fmt.Errorf("cash register is not open")
	}

	// Calculate current expected amount
	expectedAmount := s.calculateExpectedCash(&register)

	// Create temporary report for current status
	report := &models.CashRegisterReport{
		CashRegisterID:  register.ID,
		Date:            register.OpenedAt,
		OpeningBalance:  register.OpeningAmount,
		ClosingBalance:  expectedAmount, // Use expected as current
		ExpectedBalance: expectedAmount,
		Difference:      0, // No difference since we're using expected
		Notes:           fmt.Sprintf("Reporte parcial - %s", time.Now().Format("2006-01-02 15:04:05")),
		GeneratedBy:     register.EmployeeID,
		Employee:        register.Employee, // Assign employee from register
	}

	// Calculate sales totals (same logic as generateCashRegisterReport)
	var sales []models.Sale
	s.db.Where("cash_register_id = ?", register.ID).Find(&sales)

	report.NumberOfSales = len(sales)

	for _, sale := range sales {
		report.TotalSales += sale.Total

		// Get payment details
		var payments []models.Payment
		s.db.Preload("PaymentMethod").Where("sale_id = ?", sale.ID).Find(&payments)

		for _, payment := range payments {
			switch payment.PaymentMethod.Type {
			case "cash":
				report.TotalCash += payment.Amount
			case "card":
				report.TotalCard += payment.Amount
			case "digital":
				report.TotalDigital += payment.Amount
			default:
				report.TotalOther += payment.Amount
			}
		}

		if sale.Status == "refunded" || sale.Status == "partial_refund" {
			report.NumberOfRefunds++
			report.TotalRefunds += sale.Total
		}

		report.TotalDiscounts += sale.Discount
		report.TotalTax += sale.Tax
	}

	// Calculate deposits and withdrawals
	for _, movement := range register.Movements {
		if movement.Type == "deposit" && movement.Reference != "OPENING" {
			report.CashDeposits += movement.Amount
		} else if movement.Type == "withdrawal" {
			report.CashWithdrawals += movement.Amount
		}
	}

	// Print report (don't save to database - it's just a preview)
	return s.printerSvc.PrintCashRegisterReport(report)
}

// PrintLastCashRegisterReport prints the last cash register closing report
func (s *EmployeeService) PrintLastCashRegisterReport(employeeID uint) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	// Find the last closed cash register for this employee
	var register models.CashRegister
	err := s.db.Preload("Movements").
		Preload("Employee").
		Where("employee_id = ? AND status = ?", employeeID, "closed").
		Order("closed_at DESC").
		First(&register).Error

	if err != nil {
		return fmt.Errorf("no closed cash register found for this employee")
	}

	// Generate report from the closed register
	report, err := s.generateCashRegisterReport(&register)
	if err != nil {
		return fmt.Errorf("failed to generate report: %w", err)
	}

	// Print the report
	return s.printerSvc.PrintCashRegisterReport(report)
}

// GetCashRegisterReport gets a cash register report by ID
func (s *EmployeeService) GetCashRegisterReport(reportID uint) (*models.CashRegisterReport, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var report models.CashRegisterReport
	err := s.db.Preload("Employee").First(&report, reportID).Error
	if err != nil {
		return nil, fmt.Errorf("cash register report not found: %w", err)
	}
	return &report, nil
}

// AddCashMovement adds a cash movement to the current register
func (s *EmployeeService) AddCashMovement(registerID uint, amount float64, movementType, description, reference string, employeeID uint) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	// Verify register exists and is open
	var register models.CashRegister
	if err := s.db.First(&register, registerID).Error; err != nil {
		return fmt.Errorf("cash register not found")
	}

	if register.Status != "open" {
		return fmt.Errorf("cash register is closed")
	}

	// Create movement
	movement := models.CashMovement{
		CashRegisterID: registerID,
		Type:           movementType,
		Amount:         amount,
		Description:    description,
		Reference:      reference,
		EmployeeID:     employeeID,
	}

	return s.db.Create(&movement).Error
}

// GetCashMovements gets cash movements for a register
func (s *EmployeeService) GetCashMovements(registerID uint) ([]models.CashMovement, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var movements []models.CashMovement

	err := s.db.Preload("Employee").
		Where("cash_register_id = ?", registerID).
		Order("created_at DESC").
		Find(&movements).Error

	return movements, err
}

// GetCashRegisterHistory gets cash register history
func (s *EmployeeService) GetCashRegisterHistory(limit, offset int) ([]models.CashRegister, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var registers []models.CashRegister

	err := s.db.Preload("Employee").
		Order("opened_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&registers).Error

	return registers, err
}

// Helper methods

func (s *EmployeeService) calculateExpectedCash(register *models.CashRegister) float64 {
	expected := register.OpeningAmount

	// Add all cash movements (excluding opening movement to avoid double counting)
	for _, movement := range register.Movements {
		// Skip opening movement since it's already included in OpeningAmount
		if movement.Reference == "OPENING" {
			continue
		}

		if movement.Type == "sale" || movement.Type == "deposit" {
			expected += movement.Amount
		} else if movement.Type == "withdrawal" || movement.Type == "refund" {
			expected -= movement.Amount
		}
	}

	// Add payments in cash from sales in this register
	var cashPayments []models.Payment
	s.db.Joins("JOIN sales ON payments.sale_id = sales.id").
		Joins("JOIN payment_methods ON payments.payment_method_id = payment_methods.id").
		Where("sales.cash_register_id = ? AND payment_methods.type = ?", register.ID, "cash").
		Find(&cashPayments)

	for _, payment := range cashPayments {
		expected += payment.Amount
	}

	return expected
}

func (s *EmployeeService) generateCashRegisterReport(register *models.CashRegister) (*models.CashRegisterReport, error) {
	report := &models.CashRegisterReport{
		CashRegisterID:  register.ID,
		Date:            register.OpenedAt,
		OpeningBalance:  register.OpeningAmount,
		ClosingBalance:  *register.ClosingAmount,
		ExpectedBalance: *register.ExpectedAmount,
		Difference:      *register.Difference,
		Notes:           register.Notes,
		GeneratedBy:     register.EmployeeID,
		Employee:        register.Employee, // Assign employee from register
	}

	// Calculate sales totals
	var sales []models.Sale
	s.db.Where("cash_register_id = ?", register.ID).Find(&sales)

	report.NumberOfSales = len(sales)

	for _, sale := range sales {
		report.TotalSales += sale.Total

		// Get payment details
		var payments []models.Payment
		s.db.Preload("PaymentMethod").Where("sale_id = ?", sale.ID).Find(&payments)

		for _, payment := range payments {
			switch payment.PaymentMethod.Type {
			case "cash":
				report.TotalCash += payment.Amount
			case "card":
				report.TotalCard += payment.Amount
			case "digital":
				report.TotalDigital += payment.Amount
			default:
				report.TotalOther += payment.Amount
			}
		}

		if sale.Status == "refunded" || sale.Status == "partial_refund" {
			report.NumberOfRefunds++
			report.TotalRefunds += sale.Total
		}

		report.TotalDiscounts += sale.Discount
		report.TotalTax += sale.Tax
	}

	// Calculate deposits and withdrawals
	for _, movement := range register.Movements {
		if movement.Type == "deposit" && movement.Reference != "OPENING" {
			report.CashDeposits += movement.Amount
		} else if movement.Type == "withdrawal" {
			report.CashWithdrawals += movement.Amount
		}
	}

	// Save report
	if err := s.db.Create(report).Error; err != nil {
		return nil, err
	}

	return report, nil
}

// Session Management

// CreateSession creates a new session for an employee
func (s *EmployeeService) CreateSession(employeeID uint, deviceInfo, ipAddress string) (*models.Session, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	// Generate session token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(tokenBytes)

	// Create session
	session := &models.Session{
		EmployeeID: employeeID,
		Token:      token,
		DeviceInfo: deviceInfo,
		IPAddress:  ipAddress,
		ExpiresAt:  time.Now().Add(24 * time.Hour), // 24 hour expiration
	}

	if err := s.db.Create(session).Error; err != nil {
		return nil, err
	}

	return session, nil
}

// ValidateSession validates a session token
func (s *EmployeeService) ValidateSession(token string) (*models.Employee, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var session models.Session

	// Find session
	err := s.db.Preload("Employee").
		Where("token = ? AND expires_at > ?", token, time.Now()).
		First(&session).Error

	if err != nil {
		return nil, fmt.Errorf("invalid or expired session")
	}

	// Update session activity
	session.UpdatedAt = time.Now()
	s.db.Save(&session)

	return session.Employee, nil
}

// RevokeSession revokes a session
func (s *EmployeeService) RevokeSession(token string) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.Where("token = ?", token).Delete(&models.Session{}).Error
}

// CleanExpiredSessions cleans up expired sessions
func (s *EmployeeService) CleanExpiredSessions() error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.Where("expires_at < ?", time.Now()).Delete(&models.Session{}).Error
}

// Audit logging

// LogAudit logs an audit entry
func (s *EmployeeService) LogAudit(employeeID uint, action, entity string, entityID uint, oldValue, newValue, ipAddress, userAgent string) {
	if s.db == nil {
		return
	}
	audit := models.AuditLog{
		EmployeeID: employeeID,
		Action:     action,
		Entity:     entity,
		EntityID:   entityID,
		OldValue:   oldValue,
		NewValue:   newValue,
		IPAddress:  ipAddress,
		UserAgent:  userAgent,
	}

	s.db.Create(&audit)
}

// GetAuditLogs gets audit logs with filters
func (s *EmployeeService) GetAuditLogs(employeeID uint, entity string, limit, offset int) ([]models.AuditLog, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var logs []models.AuditLog

	query := s.db.Preload("Employee")

	if employeeID > 0 {
		query = query.Where("employee_id = ?", employeeID)
	}

	if entity != "" {
		query = query.Where("entity = ?", entity)
	}

	err := query.Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&logs).Error

	return logs, err
}

// GetDailyCashRegisterReport gets or generates daily cash register report
func (s *EmployeeService) GetDailyCashRegisterReport(date time.Time) (*models.CashRegisterReport, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var report models.CashRegisterReport

	// Try to find existing report
	err := s.db.Where("DATE(date) = DATE(?)", date).First(&report).Error
	if err == nil {
		return &report, nil
	}

	// Generate new report if not found
	// This would aggregate data from all registers that day
	// Implementation depends on business requirements

	return nil, fmt.Errorf("no report found for date: %s", date.Format("2006-01-02"))
}
