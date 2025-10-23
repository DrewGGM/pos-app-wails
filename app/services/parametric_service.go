package services

import "PosApp/app/models"

// ParametricService provides access to DIAN parametric data
type ParametricService struct {
	data *models.DIANParametricData
}

// NewParametricService creates a new parametric service
func NewParametricService() *ParametricService {
	return &ParametricService{
		data: models.GetDIANParametricData(),
	}
}

// GetDepartments returns all departments
func (s *ParametricService) GetDepartments() []models.Department {
	departments := make([]models.Department, 0, len(s.data.Departments))
	for _, dept := range s.data.Departments {
		departments = append(departments, dept)
	}
	return departments
}

// GetMunicipalities returns all municipalities
func (s *ParametricService) GetMunicipalities() []models.Municipality {
	municipalities := make([]models.Municipality, 0, len(s.data.Municipalities))
	for _, mun := range s.data.Municipalities {
		municipalities = append(municipalities, mun)
	}
	return municipalities
}

// GetMunicipalitiesByDepartment returns municipalities for a specific department
func (s *ParametricService) GetMunicipalitiesByDepartment(departmentID int) []models.Municipality {
	municipalities := make([]models.Municipality, 0)
	for _, mun := range s.data.Municipalities {
		if mun.DepartmentID == departmentID {
			municipalities = append(municipalities, mun)
		}
	}
	return municipalities
}

// GetTypeDocumentIdentifications returns all document types
func (s *ParametricService) GetTypeDocumentIdentifications() []models.TypeDocumentIdentification {
	types := make([]models.TypeDocumentIdentification, 0, len(s.data.TypeDocumentIdentifications))
	for _, t := range s.data.TypeDocumentIdentifications {
		types = append(types, t)
	}
	return types
}

// GetPaymentMethods returns all payment methods
func (s *ParametricService) GetPaymentMethods() []models.DIANPaymentMethod {
	methods := make([]models.DIANPaymentMethod, 0, len(s.data.PaymentMethods))
	for _, method := range s.data.PaymentMethods {
		methods = append(methods, method)
	}
	return methods
}

// GetTypeOrganizations returns all organization types
func (s *ParametricService) GetTypeOrganizations() []models.TypeOrganization {
	types := make([]models.TypeOrganization, 0, len(s.data.TypeOrganizations))
	for _, t := range s.data.TypeOrganizations {
		types = append(types, t)
	}
	return types
}

// GetTypeRegimes returns all regime types
func (s *ParametricService) GetTypeRegimes() []models.TypeRegime {
	types := make([]models.TypeRegime, 0, len(s.data.TypeRegimes))
	for _, t := range s.data.TypeRegimes {
		types = append(types, t)
	}
	return types
}

// GetTypeLiabilities returns all liability types
func (s *ParametricService) GetTypeLiabilities() []models.TypeLiability {
	types := make([]models.TypeLiability, 0, len(s.data.TypeLiabilities))
	for _, t := range s.data.TypeLiabilities {
		types = append(types, t)
	}
	return types
}
