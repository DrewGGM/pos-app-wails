// Base model with common fields
export interface BaseModel {
  id?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

// Employee model
export interface Employee extends BaseModel {
  name: string;
  username: string;
  password?: string;
  pin?: string;
  role: 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen';
  email: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  active?: boolean; // Alias for is_active
  last_login_at?: string | null;
}

// Category model
export interface Category extends BaseModel {
  name: string;
  description?: string;
  image?: string;
  color?: string;
  display_order: number;
  is_active: boolean;
}

// Product model
export interface Product extends BaseModel {
  name: string;
  description?: string;
  price: number;
  cost?: number;
  category_id: number;
  category?: Category;
  barcode?: string;
  image?: string;
  image_url?: string; // Alias for image
  stock: number;
  is_active: boolean;
  active?: boolean; // Alias for is_active
  has_modifiers?: boolean; // Made optional
  modifiers?: Modifier[];
  min_stock?: number;
  tax_type_id?: number; // DIAN Tax Type (1=IVA 19%, 5=IVA 0%, 6=IVA 5%)
  unit_measure_id?: number; // DIAN Unit Measure (70=Unidad, 796=Porción, 797=Ración)
}

// Modifier group model
export interface ModifierGroup extends BaseModel {
  name: string;
  required: boolean;
  multiple: boolean;
  min_select: number;
  max_select: number;
  modifiers?: Modifier[];
}

// Modifier model
export interface Modifier extends BaseModel {
  name: string;
  type: 'addition' | 'removal' | 'substitution';
  price_change: number;
  group_id: number;
  group?: ModifierGroup;
}

// Table area model
export interface TableArea extends BaseModel {
  name: string;
  description?: string;
  color?: string;
  is_active: boolean;
}

// Table model
export interface Table extends BaseModel {
  number: string;
  name?: string;
  capacity: number;
  zone?: string;
  area_id?: number;
  area?: TableArea;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'blocked';
  is_active: boolean;
  position_x?: number;
  position_y?: number;
  shape?: 'square' | 'round' | 'rectangle';
  current_order?: Order;
}

// Customer model
export interface Customer extends BaseModel {
  name: string;
  identification_type: string;
  identification_number: string;
  document_type?: string; // Alias for identification_type
  document_number?: string; // Alias for identification_number
  dv?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  is_active: boolean;
  notes?: string;
  total_spent?: number;
  total_purchases?: number;
  loyalty_points?: number;
  // DIAN Electronic Invoicing fields (optional - for corporate customers)
  municipality_id?: number;
  type_document_identification_id?: number; // DIAN type (inferred from identification_type if not provided)
  type_organization_id?: number; // 1=Jurídica, 2=Natural
  type_liability_id?: number; // DIAN fiscal responsibilities
  type_regime_id?: number; // 1=Responsable IVA, 2=No responsable
  merchant_registration?: string; // Matrícula mercantil (corporates only)
}

// Order model
export interface Order extends BaseModel {
  order_number: string;
  type: 'dine_in' | 'takeout' | 'delivery';
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'paid' | 'cancelled';
  table_id?: number;
  table?: Table;
  customer_id?: number;
  customer?: Customer;
  employee_id?: number;
  employee?: Employee;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes?: string;
  source: 'pos' | 'web' | 'mobile' | 'waiter_app';
  is_synced: boolean;
  sale_id?: number;
}

// Order item model
export interface OrderItem extends BaseModel {
  order_id?: number;
  product_id: number;
  product?: Product;
  quantity: number;
  unit_price?: number; // Made optional
  price?: number; // Alias for unit_price
  subtotal?: number; // Made optional
  notes?: string;
  status?: 'pending' | 'preparing' | 'ready' | 'delivered' | 'served' | 'cancelled';
  modifiers?: OrderItemModifier[];
  sent_to_kitchen?: boolean;
  sent_to_kitchen_at?: string;
}

// Order item modifier model
export interface OrderItemModifier extends BaseModel {
  order_item_id: number;
  modifier_id: number;
  modifier?: Modifier;
  price_change: number;
}

// Sale model
export interface Sale extends BaseModel {
  sale_number: string;
  order_id: number;
  order?: Order;
  customer_id?: number;
  customer?: Customer;
  employee_id: number;
  employee?: Employee;
  cash_register_id: number;
  cash_register?: CashRegister;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amount_paid?: number; // Total amount received from customer
  change?: number; // Change returned to customer
  status: 'completed' | 'refunded' | 'partial_refund';
  invoice_type: 'none' | 'simple' | 'electronic';
  needs_electronic_invoice?: boolean; // Flag for electronic invoice per sale
  payment_details?: Payment[];
  electronic_invoice?: ElectronicInvoice;
  notes?: string;
  is_synced: boolean;
}

// Payment model
export interface Payment extends BaseModel {
  sale_id: number;
  payment_method_id: number;
  payment_method?: PaymentMethod;
  amount: number;
  reference?: string;
  allocations?: PaymentAllocation[]; // Product allocations for split payments
}

// Payment allocation model (for split payments)
export interface PaymentAllocation extends BaseModel {
  payment_id: number;
  payment?: Payment;
  order_item_id: number;
  order_item?: OrderItem;
  amount: number;
}

// Payment method model
export interface PaymentMethod extends BaseModel {
  name: string;
  code?: string; // Made optional
  type: 'cash' | 'card' | 'digital' | 'other' | 'check';
  requires_reference?: boolean; // Made optional
  requires_ref?: boolean; // Alias for requires_reference
  is_active: boolean;
  display_order: number;
  icon?: string;
}

// Electronic invoice model
export interface ElectronicInvoice extends BaseModel {
  sale_id: number;
  prefix: string;
  invoice_number: string;
  uuid?: string;
  cufe: string;
  qr_code: string;
  zip_key: string;
  xml_document?: string;
  pdf_document?: string;
  status: 'pending' | 'sent' | 'validating' | 'accepted' | 'rejected' | 'error';
  is_valid?: boolean;
  validation_message?: string;
  validation_checked_at?: string;
  dian_response?: string;
  sent_at?: string;
  accepted_at?: string;
  retry_count?: number;
  last_error?: string;
}

// Cash register model
export interface CashRegister extends BaseModel {
  employee_id: number;
  employee?: Employee;
  opening_amount: number;
  closing_amount?: number;
  expected_amount?: number;
  difference?: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  notes?: string;
  movements?: CashMovement[];
}

// Cash movement model
export interface CashMovement extends BaseModel {
  cash_register_id: number;
  type: 'sale' | 'deposit' | 'withdrawal' | 'refund' | 'in' | 'out';
  amount: number;
  description?: string;
  reason?: string; // Added missing property
  reference?: string;
  employee_id: number;
  employee?: Employee;
  created_by?: string; // Added missing property
}

// Cash register report model
export interface CashRegisterReport extends BaseModel {
  cash_register_id: number;
  date: string;
  opening_balance: number;
  closing_balance: number;
  expected_balance: number;
  difference: number;
  total_sales: number;
  total_cash: number;
  total_card: number;
  total_digital: number;
  total_other: number;
  number_of_sales: number;
  number_of_refunds?: number;
  total_refunds?: number;
  total_discounts?: number;
  total_tax?: number;
  cash_deposits?: number;
  cash_withdrawals?: number;
  notes?: string;
  generated_by: number;
  employee?: Employee;
}

// Session model
export interface Session extends BaseModel {
  employee_id: number;
  employee?: Employee;
  token: string;
  device_info?: string;
  ip_address?: string;
  expires_at: string;
}

// Audit log model
export interface AuditLog extends BaseModel {
  employee_id: number;
  employee?: Employee;
  action: string;
  entity: string;
  entity_id: number;
  old_value?: string;
  new_value?: string;
  ip_address?: string;
  user_agent?: string;
}

// System config model
export interface SystemConfig extends BaseModel {
  key: string;
  value: string;
  type: string;
  category: string;
  is_locked: boolean;
  description?: string;
}

// Restaurant config model
export interface RestaurantConfig extends BaseModel {
  name: string;
  logo?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  restaurant_mode: 'traditional' | 'fast_food' | 'bar' | 'cafe';
  enable_table_management: boolean;
  enable_kitchen_display: boolean;
  enable_waiter_app: boolean;
  invoice_header?: string;
  invoice_footer?: string;
  show_logo_on_invoice: boolean;
  default_tax_rate: number;
  tax_included_in_price: boolean;
  currency: string;
  currency_symbol: string;
  decimal_places: number;
  opening_time: string;
  closing_time: string;
  working_days: string;
}

// DIAN config model
export interface DIANConfig extends BaseModel {
  environment: 'test' | 'production';
  is_enabled: boolean;
  api_url: string;
  identification_number: string;
  dv?: string;
  business_name?: string;
  merchant_registration?: string;
  software_id?: string;
  software_pin?: string;
  certificate?: string;
  certificate_password?: string;

  // Invoice Resolution
  resolution_number?: string;
  resolution_date?: string;
  resolution_prefix?: string;
  resolution_from?: number;
  resolution_to?: number;
  resolution_date_from?: string;
  resolution_date_to?: string;
  technical_key?: string;

  // Credit Note (NC) Resolution
  credit_note_resolution_number?: string;
  credit_note_resolution_prefix?: string;
  credit_note_resolution_from?: number;
  credit_note_resolution_to?: number;
  credit_note_resolution_date_from?: string;
  credit_note_resolution_date_to?: string;

  // Debit Note (ND) Resolution
  debit_note_resolution_number?: string;
  debit_note_resolution_prefix?: string;
  debit_note_resolution_from?: number;
  debit_note_resolution_to?: number;
  debit_note_resolution_date_from?: string;
  debit_note_resolution_date_to?: string;

  // Parametric IDs
  type_document_id?: number;
  type_organization_id?: number;
  type_regime_id?: number;
  type_liability_id?: number;
  municipality_id?: number;

  // API Settings
  api_token?: string;
  test_set_id?: string;
  use_test_set_id?: boolean;

  // Counters
  last_invoice_number?: number;
  last_credit_note_number?: number;
  last_debit_note_number?: number;

  // Email Settings
  send_email?: boolean;
  email_host?: string;
  email_port?: number;
  email_username?: string;
  email_password?: string;
  email_encryption?: string;

  // Configuration Steps
  step1_completed?: boolean;
  step2_completed?: boolean;
  step3_completed?: boolean;
  step4_completed?: boolean;
  step5_completed?: boolean;
  step6_completed?: boolean;
  step7_completed?: boolean;
}

// Printer config model
export interface PrinterConfig extends BaseModel {
  name: string;
  type: 'usb' | 'network' | 'serial';
  connection_type: 'usb' | 'ethernet' | 'wifi' | 'bluetooth';
  address: string;
  port?: number;
  model?: string;
  paper_width: number;
  is_default: boolean;
  is_active: boolean;
  print_logo: boolean;
  auto_cut: boolean;
  cash_drawer: boolean;
}

// Inventory movement model
export interface InventoryMovement extends BaseModel {
  product_id: number;
  product?: Product;
  type: 'purchase' | 'sale' | 'adjustment' | 'transfer' | 'return';
  quantity: number;
  previous_qty: number;
  new_qty: number;
  reference?: string;
  notes?: string;
  employee_id?: number;
  employee?: Employee;
}

// Queued invoice model
export interface QueuedInvoice extends BaseModel {
  sale_id: number;
  type: 'invoice' | 'credit_note' | 'debit_note';
  retry_count: number;
  max_retries: number;
  last_error?: string;
  next_retry?: string;
}

// Sync status model
export interface SyncStatus extends BaseModel {
  last_sync_at?: string;
  status: 'syncing' | 'completed' | 'failed';
  pending_orders: number;
  pending_sales: number;
  pending_invoices: number;
  last_error?: string;
}

// CreateOrderData interface
export interface CreateOrderData {
  type: 'dine_in' | 'takeout' | 'delivery';
  table_id?: number;
  customer_id?: number;
  employee_id?: number;
  items: Partial<OrderItem>[];
  notes?: string;
  source?: string;
}

// ProcessSaleData interface
export interface ProcessSaleData {
  order_id: number;
  customer_id?: number;
  payment_methods: PaymentData[];
  discount?: number;
  notes?: string;
  employee_id: number;
  cash_register_id: number;
  needs_electronic_invoice?: boolean;
  send_email_to_customer?: boolean; // Send electronic invoice PDF to customer email
}

// PaymentData interface
export interface PaymentData {
  payment_method_id: number;
  amount: number;
  reference?: string;
}
