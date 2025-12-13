package mcp

import (
	"fmt"
)

// getCustomerTools returns tool definitions for customer operations
func getCustomerTools() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"name":        "list_customers",
			"description": "List all customers with optional pagination. Returns customer name, email, phone, and document information.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of customers to return (default: 50)",
					},
					"offset": map[string]interface{}{
						"type":        "integer",
						"description": "Number of customers to skip (for pagination)",
					},
				},
			},
		},
		{
			"name":        "get_customer",
			"description": "Get detailed information about a specific customer by ID",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"customer_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the customer",
					},
				},
				"required": []string{"customer_id"},
			},
		},
		{
			"name":        "create_customer",
			"description": "Create a new customer. Required fields: name. Optional: email, phone, document_type, document_number, address",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Customer's full name",
					},
					"email": map[string]interface{}{
						"type":        "string",
						"description": "Customer's email address",
					},
					"phone": map[string]interface{}{
						"type":        "string",
						"description": "Customer's phone number",
					},
					"document_type": map[string]interface{}{
						"type":        "string",
						"description": "Type of identification document (CC, NIT, CE, etc.)",
						"enum":        []string{"CC", "NIT", "CE", "TI", "PP", "DIE"},
					},
					"document_number": map[string]interface{}{
						"type":        "string",
						"description": "Identification document number",
					},
					"address": map[string]interface{}{
						"type":        "string",
						"description": "Customer's address",
					},
				},
				"required": []string{"name"},
			},
		},
		{
			"name":        "update_customer",
			"description": "Update an existing customer's information",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"customer_id": map[string]interface{}{
						"type":        "integer",
						"description": "The unique ID of the customer to update",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Customer's full name",
					},
					"email": map[string]interface{}{
						"type":        "string",
						"description": "Customer's email address",
					},
					"phone": map[string]interface{}{
						"type":        "string",
						"description": "Customer's phone number",
					},
					"document_type": map[string]interface{}{
						"type":        "string",
						"description": "Type of identification document",
					},
					"document_number": map[string]interface{}{
						"type":        "string",
						"description": "Identification document number",
					},
					"address": map[string]interface{}{
						"type":        "string",
						"description": "Customer's address",
					},
				},
				"required": []string{"customer_id"},
			},
		},
		{
			"name":        "search_customers",
			"description": "Search customers by name, email, phone, or document number",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Search term to find in customer name, email, phone, or document",
					},
				},
				"required": []string{"query"},
			},
		},
	}
}

// executeCustomerTool executes a customer-related tool
func executeCustomerTool(svc SalesServiceInterface, name string, args map[string]interface{}) (interface{}, error) {
	if svc == nil {
		return nil, fmt.Errorf("sales service not available")
	}

	switch name {
	case "list_customers":
		return svc.GetCustomers()

	case "get_customer":
		customerID, ok := args["customer_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("customer_id is required")
		}
		return svc.GetCustomer(uint(customerID))

	case "create_customer":
		return svc.CreateCustomer(args)

	case "update_customer":
		customerID, ok := args["customer_id"].(float64)
		if !ok {
			return nil, fmt.Errorf("customer_id is required")
		}
		// Remove customer_id from args before passing to update
		delete(args, "customer_id")
		return svc.UpdateCustomer(uint(customerID), args)

	case "search_customers":
		query, ok := args["query"].(string)
		if !ok {
			return nil, fmt.Errorf("query is required")
		}
		return svc.SearchCustomers(query)

	default:
		return nil, fmt.Errorf("unknown customer tool: %s", name)
	}
}
