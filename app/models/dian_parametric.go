package models

// DIANParametricData contains all DIAN parametric IDs
type DIANParametricData struct {
	TypeDocumentIdentifications map[int]TypeDocumentIdentification
	TypeOrganizations           map[int]TypeOrganization
	TypeRegimes                 map[int]TypeRegime
	TypeLiabilities             map[int]TypeLiability
	TypeDocuments               map[int]TypeDocument
	Municipalities              map[int]Municipality
	Departments                 map[int]Department
	UnitMeasures                map[int]UnitMeasure
	PaymentMethods              map[int]DIANPaymentMethod
	PaymentForms                map[int]PaymentForm
	CreditNoteDiscrepancies     map[int]DiscrepancyResponse
	DebitNoteDiscrepancies      map[int]DiscrepancyResponse
	Discounts                   map[int]Discount
	TaxTypes                    map[int]TaxType
}

type TypeDocumentIdentification struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Code     string `json:"code"`
	CodeRips string `json:"code_rips,omitempty"`
}

type TypeOrganization struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type TypeRegime struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type TypeLiability struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type TypeDocument struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	Code          string `json:"code"`
	CufeAlgorithm string `json:"cufe_algorithm"`
	Prefix        string `json:"prefix"`
}

type Municipality struct {
	ID           int    `json:"id"`
	DepartmentID int    `json:"department_id"`
	Name         string `json:"name"`
	Code         string `json:"code"`
}

type Department struct {
	ID        int    `json:"id"`
	CountryID int    `json:"country_id"`
	Name      string `json:"name"`
	Code      string `json:"code"`
}

type UnitMeasure struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type DIANPaymentMethod struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type PaymentForm struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type DiscrepancyResponse struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type Discount struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type TaxType struct {
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	Code    string  `json:"code"`
	Percent float64 `json:"percent"`
}

// GetDIANParametricData returns all DIAN parametric data
func GetDIANParametricData() *DIANParametricData {
	return &DIANParametricData{
		TypeDocumentIdentifications: map[int]TypeDocumentIdentification{
			1:  {ID: 1, Name: "Registro civil", Code: "11", CodeRips: "RC"},
			2:  {ID: 2, Name: "Tarjeta de identidad", Code: "12", CodeRips: "TI"},
			3:  {ID: 3, Name: "Cédula de ciudadanía", Code: "13", CodeRips: "CC"},
			4:  {ID: 4, Name: "Tarjeta de extranjería", Code: "21", CodeRips: "CN"},
			5:  {ID: 5, Name: "Cédula de extranjería", Code: "22", CodeRips: "CE"},
			6:  {ID: 6, Name: "NIT", Code: "31", CodeRips: "NI"},
			7:  {ID: 7, Name: "Pasaporte", Code: "41", CodeRips: "PA"},
			8:  {ID: 8, Name: "Documento de identificación extranjero", Code: "42", CodeRips: "DE"},
			9:  {ID: 9, Name: "NIT de otro país", Code: "50", CodeRips: "NI"},
			10: {ID: 10, Name: "NUIP", Code: "91", CodeRips: ""},
			11: {ID: 11, Name: "PEP (Permiso Especial de Permanencia)", Code: "47", CodeRips: "PE"},
			12: {ID: 12, Name: "PPT (Permiso Protección Temporal)", Code: "48", CodeRips: "PT"},
		},
		TypeOrganizations: map[int]TypeOrganization{
			1: {ID: 1, Name: "Persona Jurídica y asimiladas", Code: "1"},
			2: {ID: 2, Name: "Persona Natural y asimiladas", Code: "2"},
		},
		TypeRegimes: map[int]TypeRegime{
			1: {ID: 1, Name: "Responsable de IVA", Code: "48"},
			2: {ID: 2, Name: "No Responsable de IVA", Code: "49"},
		},
		TypeLiabilities: map[int]TypeLiability{
			7:   {ID: 7, Name: "Gran contribuyente", Code: "O-13"},
			9:   {ID: 9, Name: "Autorretenedor", Code: "O-15"},
			14:  {ID: 14, Name: "Agente de retención en el impuesto sobre las ventas", Code: "O-23"},
			112: {ID: 112, Name: "Régimen Simple de Tributación - SIMPLE", Code: "O-47"},
			117: {ID: 117, Name: "No responsable", Code: "R-99-PN"},
		},
		TypeDocuments: map[int]TypeDocument{
			1:  {ID: 1, Name: "Factura de Venta Nacional", Code: "01", CufeAlgorithm: "CUFE-SHA384", Prefix: "fv"},
			2:  {ID: 2, Name: "Factura de Exportación", Code: "02", CufeAlgorithm: "CUFE-SHA384", Prefix: "fv"},
			3:  {ID: 3, Name: "Factura de Contingencia", Code: "03", CufeAlgorithm: "CUFE-SHA384", Prefix: "fv"},
			4:  {ID: 4, Name: "Nota Crédito", Code: "91", CufeAlgorithm: "CUDE-SHA384", Prefix: "nc"},
			5:  {ID: 5, Name: "Nota Débito", Code: "92", CufeAlgorithm: "CUDE-SHA384", Prefix: "nd"},
			11: {ID: 11, Name: "Documento Soporte Electrónico", Code: "05", CufeAlgorithm: "CUDS-SHA384", Prefix: "dse"},
			12: {ID: 12, Name: "Factura electrónica de Venta - tipo 04", Code: "04", CufeAlgorithm: "CUFE-SHA384", Prefix: "fv"},
			13: {ID: 13, Name: "Nota de Ajuste al Documento Soporte Electrónico", Code: "95", CufeAlgorithm: "CUDS-SHA384", Prefix: "nds"},
			15: {ID: 15, Name: "Documento equivalente electrónico del tiquete de máquina registradora con sistema P.O.S.", Code: "20", CufeAlgorithm: "CUDE-SHA384", Prefix: "pos"},
			25: {ID: 25, Name: "Nota de Ajuste de tipo débito al Documento Equivalente", Code: "93", CufeAlgorithm: "CUDE-SHA384", Prefix: "ndq"},
			26: {ID: 26, Name: "Nota de Ajuste de tipo crédito al Documento Equivalente", Code: "94", CufeAlgorithm: "CUDE-SHA384", Prefix: "ncq"},
		},
		Municipalities: getMunicipalitiesData(),
		Departments:    getDepartmentsData(),
		UnitMeasures: map[int]UnitMeasure{
			70:  {ID: 70, Name: "Unidad", Code: "SET"},
			94:  {ID: 94, Name: "Unidad", Code: "EA"},
			50:  {ID: 50, Name: "1000 Unidad", Code: "MIL"},
			796: {ID: 796, Name: "Porción", Code: "PTN"},
			797: {ID: 797, Name: "Ración", Code: "PTN"},
		},
		PaymentMethods: map[int]DIANPaymentMethod{
			1:  {ID: 1, Name: "Instrumento no definido", Code: "1"},
			2:  {ID: 2, Name: "Crédito ACH", Code: "2"},
			10: {ID: 10, Name: "Efectivo", Code: "10"},
			20: {ID: 20, Name: "Cheque", Code: "20"},
			30: {ID: 30, Name: "Transferencia Débito Bancaria", Code: "30"},
			42: {ID: 42, Name: "Consignación bancaria", Code: "42"},
			47: {ID: 47, Name: "Transferencia Interbancaria", Code: "47"},
			48: {ID: 48, Name: "Tarjeta Débito", Code: "48"},
			49: {ID: 49, Name: "Tarjeta Crédito", Code: "49"},
			71: {ID: 71, Name: "Bonos", Code: "71"},
			72: {ID: 72, Name: "Bonos o vales electrónicos", Code: "72"},
		},
		PaymentForms: map[int]PaymentForm{
			1: {ID: 1, Name: "Contado", Code: "1"},
			2: {ID: 2, Name: "Crédito", Code: "2"},
		},
		CreditNoteDiscrepancies: map[int]DiscrepancyResponse{
			1: {ID: 1, Name: "Devolución parcial de los bienes y/o no aceptación", Code: "1"},
			2: {ID: 2, Name: "Anulación de factura electrónica", Code: "2"},
			3: {ID: 3, Name: "Rebaja o descuento parcial o total", Code: "3"},
			4: {ID: 4, Name: "Ajuste de precio", Code: "4"},
			5: {ID: 5, Name: "Otros", Code: "5"},
			6: {ID: 6, Name: "Descuento comercial por volumen de ventas", Code: "6"},
		},
		DebitNoteDiscrepancies: map[int]DiscrepancyResponse{
			1: {ID: 1, Name: "Intereses", Code: "1"},
			2: {ID: 2, Name: "Gastos por cobrar", Code: "2"},
			3: {ID: 3, Name: "Cambio del valor", Code: "3"},
			4: {ID: 4, Name: "Otros", Code: "4"},
		},
		Discounts: map[int]Discount{
			1:  {ID: 1, Name: "Descuento comercial", Code: "00"},
			11: {ID: 11, Name: "Descuento por pronto pago", Code: "01"},
			12: {ID: 12, Name: "Descuento por volumen de compras", Code: "02"},
		},
		TaxTypes: map[int]TaxType{
			1: {ID: 1, Name: "IVA", Code: "01", Percent: 19.00},
			2: {ID: 2, Name: "IC", Code: "02", Percent: 0.00},
			3: {ID: 3, Name: "ICA", Code: "03", Percent: 0.00},
			4: {ID: 4, Name: "INC", Code: "04", Percent: 0.00},
			5: {ID: 5, Name: "IVA 0%", Code: "01", Percent: 0.00},
			6: {ID: 6, Name: "IVA 5%", Code: "01", Percent: 5.00},
		},
	}
}

// getMunicipalitiesData returns municipality data (partial list for brevity)
func getMunicipalitiesData() map[int]Municipality {
	return map[int]Municipality{
		820: {ID: 820, DepartmentID: 25, Name: "Armenia", Code: "63001"},
		821: {ID: 821, DepartmentID: 25, Name: "Buenavista", Code: "63111"},
		822: {ID: 822, DepartmentID: 25, Name: "Calarcá", Code: "63130"},
		823: {ID: 823, DepartmentID: 25, Name: "Circasia", Code: "63190"},
		824: {ID: 824, DepartmentID: 25, Name: "Córdoba", Code: "63212"},
		825: {ID: 825, DepartmentID: 25, Name: "Filandia", Code: "63272"},
		826: {ID: 826, DepartmentID: 25, Name: "Génova", Code: "63302"},
		827: {ID: 827, DepartmentID: 25, Name: "La Tebaida", Code: "63401"},
		828: {ID: 828, DepartmentID: 25, Name: "Montenegro", Code: "63470"},
		829: {ID: 829, DepartmentID: 25, Name: "Pijao", Code: "63548"},
		830: {ID: 830, DepartmentID: 25, Name: "Quimbaya", Code: "63594"},
		831: {ID: 831, DepartmentID: 25, Name: "Salento", Code: "63690"},
		832: {ID: 832, DepartmentID: 26, Name: "Pereira", Code: "66001"},
		833: {ID: 833, DepartmentID: 26, Name: "Apía", Code: "66045"},
		834: {ID: 834, DepartmentID: 26, Name: "Balboa", Code: "66075"},
		// Add more municipalities as needed
		600: {ID: 600, DepartmentID: 15, Name: "Medellín", Code: "05001"},
		1:   {ID: 1, DepartmentID: 5, Name: "Bogotá D.C.", Code: "11001"},
	}
}

// getDepartmentsData returns department data
func getDepartmentsData() map[int]Department {
	return map[int]Department{
		1:  {ID: 1, CountryID: 46, Name: "Amazonas", Code: "91"},
		2:  {ID: 2, CountryID: 46, Name: "Antioquia", Code: "05"},
		3:  {ID: 3, CountryID: 46, Name: "Arauca", Code: "81"},
		4:  {ID: 4, CountryID: 46, Name: "Atlántico", Code: "08"},
		5:  {ID: 5, CountryID: 46, Name: "Bogotá", Code: "11"},
		6:  {ID: 6, CountryID: 46, Name: "Bolívar", Code: "13"},
		7:  {ID: 7, CountryID: 46, Name: "Boyacá", Code: "15"},
		8:  {ID: 8, CountryID: 46, Name: "Caldas", Code: "17"},
		9:  {ID: 9, CountryID: 46, Name: "Caquetá", Code: "18"},
		10: {ID: 10, CountryID: 46, Name: "Casanare", Code: "85"},
		11: {ID: 11, CountryID: 46, Name: "Cauca", Code: "19"},
		12: {ID: 12, CountryID: 46, Name: "Cesar", Code: "20"},
		13: {ID: 13, CountryID: 46, Name: "Chocó", Code: "27"},
		14: {ID: 14, CountryID: 46, Name: "Córdoba", Code: "23"},
		15: {ID: 15, CountryID: 46, Name: "Cundinamarca", Code: "25"},
		16: {ID: 16, CountryID: 46, Name: "Guainía", Code: "94"},
		17: {ID: 17, CountryID: 46, Name: "Guaviare", Code: "95"},
		18: {ID: 18, CountryID: 46, Name: "Huila", Code: "41"},
		19: {ID: 19, CountryID: 46, Name: "La Guajira", Code: "44"},
		20: {ID: 20, CountryID: 46, Name: "Magdalena", Code: "47"},
		21: {ID: 21, CountryID: 46, Name: "Meta", Code: "50"},
		22: {ID: 22, CountryID: 46, Name: "Nariño", Code: "52"},
		23: {ID: 23, CountryID: 46, Name: "Norte de Santander", Code: "54"},
		24: {ID: 24, CountryID: 46, Name: "Putumayo", Code: "86"},
		25: {ID: 25, CountryID: 46, Name: "Quindío", Code: "63"},
		26: {ID: 26, CountryID: 46, Name: "Risaralda", Code: "66"},
		27: {ID: 27, CountryID: 46, Name: "San Andrés y Providencia", Code: "88"},
		28: {ID: 28, CountryID: 46, Name: "Santander", Code: "68"},
		29: {ID: 29, CountryID: 46, Name: "Sucre", Code: "70"},
		30: {ID: 30, CountryID: 46, Name: "Tolima", Code: "73"},
		31: {ID: 31, CountryID: 46, Name: "Valle del Cauca", Code: "76"},
		32: {ID: 32, CountryID: 46, Name: "Vaupés", Code: "97"},
		33: {ID: 33, CountryID: 46, Name: "Vichada", Code: "99"},
	}
}
