package mcp

import (
	"fmt"
)

// getReportTools returns tool definitions for report operations
func getReportTools() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"name":        "get_daily_sales_report",
			"description": "Get a summary of sales for a specific date including total sales, order count, and breakdown by payment method",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"date": map[string]interface{}{
						"type":        "string",
						"description": "Date for the report (YYYY-MM-DD format). Defaults to today if not specified.",
					},
				},
			},
		},
		{
			"name":        "get_sales_by_period",
			"description": "Get sales aggregated by period (day, week, or month) within a date range",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"from_date": map[string]interface{}{
						"type":        "string",
						"description": "Start date (YYYY-MM-DD format)",
					},
					"to_date": map[string]interface{}{
						"type":        "string",
						"description": "End date (YYYY-MM-DD format)",
					},
					"group_by": map[string]interface{}{
						"type":        "string",
						"description": "How to group the results",
						"enum":        []string{"day", "week", "month"},
					},
				},
				"required": []string{"from_date", "to_date"},
			},
		},
		{
			"name":        "get_top_products",
			"description": "Get the top selling products by quantity or revenue",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Number of top products to return (default: 10)",
					},
					"from_date": map[string]interface{}{
						"type":        "string",
						"description": "Start date for the analysis (YYYY-MM-DD format)",
					},
					"to_date": map[string]interface{}{
						"type":        "string",
						"description": "End date for the analysis (YYYY-MM-DD format)",
					},
					"sort_by": map[string]interface{}{
						"type":        "string",
						"description": "Sort by quantity sold or revenue",
						"enum":        []string{"quantity", "revenue"},
					},
				},
			},
		},
		{
			"name":        "get_sales_by_payment_method",
			"description": "Get sales breakdown by payment method within a date range",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"from_date": map[string]interface{}{
						"type":        "string",
						"description": "Start date (YYYY-MM-DD format)",
					},
					"to_date": map[string]interface{}{
						"type":        "string",
						"description": "End date (YYYY-MM-DD format)",
					},
				},
				"required": []string{"from_date", "to_date"},
			},
		},
		{
			"name":        "get_sales_by_employee",
			"description": "Get sales breakdown by employee within a date range",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"from_date": map[string]interface{}{
						"type":        "string",
						"description": "Start date (YYYY-MM-DD format)",
					},
					"to_date": map[string]interface{}{
						"type":        "string",
						"description": "End date (YYYY-MM-DD format)",
					},
				},
				"required": []string{"from_date", "to_date"},
			},
		},
		{
			"name":        "get_cash_register_status",
			"description": "Get the current status of the cash register including opening balance, current balance, and transactions",
			"inputSchema": map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			"name":        "get_inventory_report",
			"description": "Get a complete inventory report showing all products with their stock levels and values",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"include_movements": map[string]interface{}{
						"type":        "boolean",
						"description": "Include recent stock movements in the report",
					},
				},
			},
		},
	}
}

// executeReportTool executes a report-related tool
func executeReportTool(dashSvc DashboardServiceInterface, reportSvc ReportsServiceInterface, name string, args map[string]interface{}) (interface{}, error) {
	switch name {
	case "get_daily_sales_report":
		if reportSvc == nil {
			return nil, fmt.Errorf("reports service not available")
		}
		date, _ := args["date"].(string)
		return reportSvc.GetDailySalesReport(date)

	case "get_sales_by_period":
		if reportSvc == nil {
			return nil, fmt.Errorf("reports service not available")
		}
		fromDate, _ := args["from_date"].(string)
		toDate, _ := args["to_date"].(string)
		groupBy := "day"
		if g, ok := args["group_by"].(string); ok {
			groupBy = g
		}
		if fromDate == "" || toDate == "" {
			return nil, fmt.Errorf("from_date and to_date are required")
		}
		return reportSvc.GetSalesByPeriod(fromDate, toDate, groupBy)

	case "get_top_products":
		if dashSvc == nil {
			return nil, fmt.Errorf("dashboard service not available")
		}
		limit := 10
		if l, ok := args["limit"].(float64); ok {
			limit = int(l)
		}
		return dashSvc.GetTopSellingItems(limit)

	case "get_sales_by_payment_method":
		if reportSvc == nil {
			return nil, fmt.Errorf("reports service not available")
		}
		fromDate, _ := args["from_date"].(string)
		toDate, _ := args["to_date"].(string)
		if fromDate == "" || toDate == "" {
			return nil, fmt.Errorf("from_date and to_date are required")
		}
		return reportSvc.GetSalesByPaymentMethod(fromDate, toDate)

	case "get_sales_by_employee":
		if reportSvc == nil {
			return nil, fmt.Errorf("reports service not available")
		}
		fromDate, _ := args["from_date"].(string)
		toDate, _ := args["to_date"].(string)
		if fromDate == "" || toDate == "" {
			return nil, fmt.Errorf("from_date and to_date are required")
		}
		return reportSvc.GetSalesByEmployee(fromDate, toDate)

	case "get_cash_register_status":
		if dashSvc == nil {
			return nil, fmt.Errorf("dashboard service not available")
		}
		return dashSvc.GetCashRegisterStatus()

	case "get_inventory_report":
		if reportSvc == nil {
			return nil, fmt.Errorf("reports service not available")
		}
		return reportSvc.GetInventoryReport()

	default:
		return nil, fmt.Errorf("unknown report tool: %s", name)
	}
}
