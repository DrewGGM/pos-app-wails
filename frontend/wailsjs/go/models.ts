export namespace gorm {
	
	export class DeletedAt {
	    Time: time.Time;
	    Valid: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DeletedAt(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Time = this.convertValues(source["Time"], time.Time);
	        this.Valid = source["Valid"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace models {
	
	export class Employee {
	    id: number;
	    name: string;
	    username: string;
	    role: string;
	    email: string;
	    phone: string;
	    is_active: boolean;
	    last_login_at?: time.Time;
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new Employee(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.username = source["username"];
	        this.role = source["role"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.is_active = source["is_active"];
	        this.last_login_at = this.convertValues(source["last_login_at"], time.Time);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AuditLog {
	    id: number;
	    employee_id: number;
	    employee?: Employee;
	    action: string;
	    entity: string;
	    entity_id: number;
	    old_value: string;
	    new_value: string;
	    ip_address: string;
	    user_agent: string;
	    created_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new AuditLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.employee_id = source["employee_id"];
	        this.employee = this.convertValues(source["employee"], Employee);
	        this.action = source["action"];
	        this.entity = source["entity"];
	        this.entity_id = source["entity_id"];
	        this.old_value = source["old_value"];
	        this.new_value = source["new_value"];
	        this.ip_address = source["ip_address"];
	        this.user_agent = source["user_agent"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CashMovement {
	    id: number;
	    cash_register_id: number;
	    type: string;
	    amount: number;
	    description: string;
	    reference: string;
	    employee_id: number;
	    employee?: Employee;
	    created_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new CashMovement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.cash_register_id = source["cash_register_id"];
	        this.type = source["type"];
	        this.amount = source["amount"];
	        this.description = source["description"];
	        this.reference = source["reference"];
	        this.employee_id = source["employee_id"];
	        this.employee = this.convertValues(source["employee"], Employee);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DebitNote {
	    id: number;
	    electronic_invoice_id: number;
	    number: string;
	    prefix: string;
	    uuid: string;
	    reason: string;
	    discrepancy_code: number;
	    amount: number;
	    status: string;
	    dian_response: string;
	    xml_document: string;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new DebitNote(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.electronic_invoice_id = source["electronic_invoice_id"];
	        this.number = source["number"];
	        this.prefix = source["prefix"];
	        this.uuid = source["uuid"];
	        this.reason = source["reason"];
	        this.discrepancy_code = source["discrepancy_code"];
	        this.amount = source["amount"];
	        this.status = source["status"];
	        this.dian_response = source["dian_response"];
	        this.xml_document = source["xml_document"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CreditNote {
	    id: number;
	    electronic_invoice_id: number;
	    number: string;
	    prefix: string;
	    uuid: string;
	    reason: string;
	    discrepancy_code: number;
	    amount: number;
	    status: string;
	    dian_response: string;
	    xml_document: string;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new CreditNote(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.electronic_invoice_id = source["electronic_invoice_id"];
	        this.number = source["number"];
	        this.prefix = source["prefix"];
	        this.uuid = source["uuid"];
	        this.reason = source["reason"];
	        this.discrepancy_code = source["discrepancy_code"];
	        this.amount = source["amount"];
	        this.status = source["status"];
	        this.dian_response = source["dian_response"];
	        this.xml_document = source["xml_document"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ElectronicInvoice {
	    id: number;
	    sale_id: number;
	    invoice_number: string;
	    prefix: string;
	    uuid: string;
	    cufe: string;
	    qr_code: string;
	    status: string;
	    dian_response: string;
	    sent_at?: time.Time;
	    accepted_at?: time.Time;
	    xml_document: string;
	    pdf_document: string;
	    retry_count: number;
	    last_error: string;
	    credit_notes?: CreditNote[];
	    debit_notes?: DebitNote[];
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new ElectronicInvoice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sale_id = source["sale_id"];
	        this.invoice_number = source["invoice_number"];
	        this.prefix = source["prefix"];
	        this.uuid = source["uuid"];
	        this.cufe = source["cufe"];
	        this.qr_code = source["qr_code"];
	        this.status = source["status"];
	        this.dian_response = source["dian_response"];
	        this.sent_at = this.convertValues(source["sent_at"], time.Time);
	        this.accepted_at = this.convertValues(source["accepted_at"], time.Time);
	        this.xml_document = source["xml_document"];
	        this.pdf_document = source["pdf_document"];
	        this.retry_count = source["retry_count"];
	        this.last_error = source["last_error"];
	        this.credit_notes = this.convertValues(source["credit_notes"], CreditNote);
	        this.debit_notes = this.convertValues(source["debit_notes"], DebitNote);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PaymentAllocation {
	    id: number;
	    payment_id: number;
	    order_item_id: number;
	    order_item?: OrderItem;
	    amount: number;
	    created_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new PaymentAllocation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.payment_id = source["payment_id"];
	        this.order_item_id = source["order_item_id"];
	        this.order_item = this.convertValues(source["order_item"], OrderItem);
	        this.amount = source["amount"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PaymentMethod {
	    id: number;
	    name: string;
	    type: string;
	    icon: string;
	    requires_ref: boolean;
	    is_active: boolean;
	    display_order: number;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new PaymentMethod(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.icon = source["icon"];
	        this.requires_ref = source["requires_ref"];
	        this.is_active = source["is_active"];
	        this.display_order = source["display_order"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Payment {
	    id: number;
	    sale_id: number;
	    payment_method_id: number;
	    payment_method?: PaymentMethod;
	    amount: number;
	    reference: string;
	    allocations?: PaymentAllocation[];
	    created_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new Payment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sale_id = source["sale_id"];
	        this.payment_method_id = source["payment_method_id"];
	        this.payment_method = this.convertValues(source["payment_method"], PaymentMethod);
	        this.amount = source["amount"];
	        this.reference = source["reference"];
	        this.allocations = this.convertValues(source["allocations"], PaymentAllocation);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OrderItemModifier {
	    id: number;
	    order_item_id: number;
	    modifier_id: number;
	    modifier?: Modifier;
	    price_change: number;
	    created_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new OrderItemModifier(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.order_item_id = source["order_item_id"];
	        this.modifier_id = source["modifier_id"];
	        this.modifier = this.convertValues(source["modifier"], Modifier);
	        this.price_change = source["price_change"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModifierGroup {
	    id: number;
	    name: string;
	    required: boolean;
	    multiple: boolean;
	    min_select: number;
	    max_select: number;
	    modifiers?: Modifier[];
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new ModifierGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.required = source["required"];
	        this.multiple = source["multiple"];
	        this.min_select = source["min_select"];
	        this.max_select = source["max_select"];
	        this.modifiers = this.convertValues(source["modifiers"], Modifier);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Modifier {
	    id: number;
	    name: string;
	    type: string;
	    price_change: number;
	    group_id: number;
	    modifier_group?: ModifierGroup;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new Modifier(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.price_change = source["price_change"];
	        this.group_id = source["group_id"];
	        this.modifier_group = this.convertValues(source["modifier_group"], ModifierGroup);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Category {
	    id: number;
	    name: string;
	    description: string;
	    icon: string;
	    color: string;
	    display_order: number;
	    is_active: boolean;
	    products?: Product[];
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new Category(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.icon = source["icon"];
	        this.color = source["color"];
	        this.display_order = source["display_order"];
	        this.is_active = source["is_active"];
	        this.products = this.convertValues(source["products"], Product);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Product {
	    id: number;
	    name: string;
	    description: string;
	    price: number;
	    category_id: number;
	    category?: Category;
	    image: string;
	    sku: string;
	    stock: number;
	    is_active: boolean;
	    modifiers?: Modifier[];
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new Product(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.price = source["price"];
	        this.category_id = source["category_id"];
	        this.category = this.convertValues(source["category"], Category);
	        this.image = source["image"];
	        this.sku = source["sku"];
	        this.stock = source["stock"];
	        this.is_active = source["is_active"];
	        this.modifiers = this.convertValues(source["modifiers"], Modifier);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OrderItem {
	    id: number;
	    order_id: number;
	    product_id: number;
	    product?: Product;
	    quantity: number;
	    unit_price: number;
	    subtotal: number;
	    modifiers: OrderItemModifier[];
	    notes: string;
	    status: string;
	    sent_to_kitchen: boolean;
	    sent_to_kitchen_at?: time.Time;
	    prepared_at?: time.Time;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new OrderItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.order_id = source["order_id"];
	        this.product_id = source["product_id"];
	        this.product = this.convertValues(source["product"], Product);
	        this.quantity = source["quantity"];
	        this.unit_price = source["unit_price"];
	        this.subtotal = source["subtotal"];
	        this.modifiers = this.convertValues(source["modifiers"], OrderItemModifier);
	        this.notes = source["notes"];
	        this.status = source["status"];
	        this.sent_to_kitchen = source["sent_to_kitchen"];
	        this.sent_to_kitchen_at = this.convertValues(source["sent_to_kitchen_at"], time.Time);
	        this.prepared_at = this.convertValues(source["prepared_at"], time.Time);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Customer {
	    id: number;
	    identification_type: string;
	    identification_number: string;
	    dv?: string;
	    name: string;
	    email: string;
	    phone: string;
	    address: string;
	    municipality_id?: number;
	    type_organization_id?: number;
	    type_liability_id?: number;
	    type_regime_id?: number;
	    is_active: boolean;
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new Customer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.identification_type = source["identification_type"];
	        this.identification_number = source["identification_number"];
	        this.dv = source["dv"];
	        this.name = source["name"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.address = source["address"];
	        this.municipality_id = source["municipality_id"];
	        this.type_organization_id = source["type_organization_id"];
	        this.type_liability_id = source["type_liability_id"];
	        this.type_regime_id = source["type_regime_id"];
	        this.is_active = source["is_active"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TableArea {
	    id: number;
	    name: string;
	    description: string;
	    color: string;
	    is_active: boolean;
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new TableArea(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.color = source["color"];
	        this.is_active = source["is_active"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Table {
	    id: number;
	    number: string;
	    name: string;
	    capacity: number;
	    zone: string;
	    area_id?: number;
	    area?: TableArea;
	    status: string;
	    current_order?: Order;
	    position_x: number;
	    position_y: number;
	    shape: string;
	    is_active: boolean;
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new Table(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.number = source["number"];
	        this.name = source["name"];
	        this.capacity = source["capacity"];
	        this.zone = source["zone"];
	        this.area_id = source["area_id"];
	        this.area = this.convertValues(source["area"], TableArea);
	        this.status = source["status"];
	        this.current_order = this.convertValues(source["current_order"], Order);
	        this.position_x = source["position_x"];
	        this.position_y = source["position_y"];
	        this.shape = source["shape"];
	        this.is_active = source["is_active"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Order {
	    id: number;
	    order_number: string;
	    type: string;
	    status: string;
	    table_id?: number;
	    table?: Table;
	    customer_id?: number;
	    customer?: Customer;
	    items: OrderItem[];
	    subtotal: number;
	    tax: number;
	    discount: number;
	    total: number;
	    notes: string;
	    employee_id: number;
	    employee?: Employee;
	    sale_id?: number;
	    source: string;
	    is_synced: boolean;
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new Order(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.order_number = source["order_number"];
	        this.type = source["type"];
	        this.status = source["status"];
	        this.table_id = source["table_id"];
	        this.table = this.convertValues(source["table"], Table);
	        this.customer_id = source["customer_id"];
	        this.customer = this.convertValues(source["customer"], Customer);
	        this.items = this.convertValues(source["items"], OrderItem);
	        this.subtotal = source["subtotal"];
	        this.tax = source["tax"];
	        this.discount = source["discount"];
	        this.total = source["total"];
	        this.notes = source["notes"];
	        this.employee_id = source["employee_id"];
	        this.employee = this.convertValues(source["employee"], Employee);
	        this.sale_id = source["sale_id"];
	        this.source = source["source"];
	        this.is_synced = source["is_synced"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Sale {
	    id: number;
	    sale_number: string;
	    order_id: number;
	    order?: Order;
	    customer_id?: number;
	    customer?: Customer;
	    subtotal: number;
	    tax: number;
	    discount: number;
	    total: number;
	    payment_method: string;
	    payment_details: Payment[];
	    status: string;
	    invoice_type: string;
	    needs_electronic_invoice: boolean;
	    electronic_invoice?: ElectronicInvoice;
	    employee_id: number;
	    employee?: Employee;
	    cash_register_id: number;
	    cash_register?: CashRegister;
	    notes: string;
	    is_synced: boolean;
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new Sale(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sale_number = source["sale_number"];
	        this.order_id = source["order_id"];
	        this.order = this.convertValues(source["order"], Order);
	        this.customer_id = source["customer_id"];
	        this.customer = this.convertValues(source["customer"], Customer);
	        this.subtotal = source["subtotal"];
	        this.tax = source["tax"];
	        this.discount = source["discount"];
	        this.total = source["total"];
	        this.payment_method = source["payment_method"];
	        this.payment_details = this.convertValues(source["payment_details"], Payment);
	        this.status = source["status"];
	        this.invoice_type = source["invoice_type"];
	        this.needs_electronic_invoice = source["needs_electronic_invoice"];
	        this.electronic_invoice = this.convertValues(source["electronic_invoice"], ElectronicInvoice);
	        this.employee_id = source["employee_id"];
	        this.employee = this.convertValues(source["employee"], Employee);
	        this.cash_register_id = source["cash_register_id"];
	        this.cash_register = this.convertValues(source["cash_register"], CashRegister);
	        this.notes = source["notes"];
	        this.is_synced = source["is_synced"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CashRegister {
	    id: number;
	    employee_id: number;
	    employee?: Employee;
	    opening_amount: number;
	    closing_amount?: number;
	    expected_amount?: number;
	    difference?: number;
	    status: string;
	    notes: string;
	    opened_at: time.Time;
	    closed_at?: time.Time;
	    movements?: CashMovement[];
	    sales?: Sale[];
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new CashRegister(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.employee_id = source["employee_id"];
	        this.employee = this.convertValues(source["employee"], Employee);
	        this.opening_amount = source["opening_amount"];
	        this.closing_amount = source["closing_amount"];
	        this.expected_amount = source["expected_amount"];
	        this.difference = source["difference"];
	        this.status = source["status"];
	        this.notes = source["notes"];
	        this.opened_at = this.convertValues(source["opened_at"], time.Time);
	        this.closed_at = this.convertValues(source["closed_at"], time.Time);
	        this.movements = this.convertValues(source["movements"], CashMovement);
	        this.sales = this.convertValues(source["sales"], Sale);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CashRegisterReport {
	    id: number;
	    cash_register_id: number;
	    date: time.Time;
	    total_sales: number;
	    total_cash: number;
	    total_card: number;
	    total_digital: number;
	    total_other: number;
	    total_refunds: number;
	    total_discounts: number;
	    total_tax: number;
	    number_of_sales: number;
	    number_of_refunds: number;
	    cash_deposits: number;
	    cash_withdrawals: number;
	    opening_balance: number;
	    closing_balance: number;
	    expected_balance: number;
	    difference: number;
	    notes: string;
	    generated_by: number;
	    employee?: Employee;
	    created_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new CashRegisterReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.cash_register_id = source["cash_register_id"];
	        this.date = this.convertValues(source["date"], time.Time);
	        this.total_sales = source["total_sales"];
	        this.total_cash = source["total_cash"];
	        this.total_card = source["total_card"];
	        this.total_digital = source["total_digital"];
	        this.total_other = source["total_other"];
	        this.total_refunds = source["total_refunds"];
	        this.total_discounts = source["total_discounts"];
	        this.total_tax = source["total_tax"];
	        this.number_of_sales = source["number_of_sales"];
	        this.number_of_refunds = source["number_of_refunds"];
	        this.cash_deposits = source["cash_deposits"];
	        this.cash_withdrawals = source["cash_withdrawals"];
	        this.opening_balance = source["opening_balance"];
	        this.closing_balance = source["closing_balance"];
	        this.expected_balance = source["expected_balance"];
	        this.difference = source["difference"];
	        this.notes = source["notes"];
	        this.generated_by = source["generated_by"];
	        this.employee = this.convertValues(source["employee"], Employee);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class DIANConfig {
	    id: number;
	    environment: string;
	    is_enabled: boolean;
	    identification_number: string;
	    dv: string;
	    business_name: string;
	    merchant_registration: string;
	    type_document_id: number;
	    type_organization_id: number;
	    type_regime_id: number;
	    type_liability_id: number;
	    municipality_id: number;
	    software_id: string;
	    software_pin: string;
	    certificate: string;
	    certificate_password: string;
	    resolution_number: string;
	    resolution_prefix: string;
	    resolution_from: number;
	    resolution_to: number;
	    resolution_date_from: time.Time;
	    resolution_date_to: time.Time;
	    technical_key: string;
	    api_url: string;
	    api_token: string;
	    test_set_id: string;
	    last_invoice_number: number;
	    last_credit_note_number: number;
	    last_debit_note_number: number;
	    send_email: boolean;
	    email_host: string;
	    email_port: number;
	    email_username: string;
	    email_password: string;
	    email_encryption: string;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new DIANConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.environment = source["environment"];
	        this.is_enabled = source["is_enabled"];
	        this.identification_number = source["identification_number"];
	        this.dv = source["dv"];
	        this.business_name = source["business_name"];
	        this.merchant_registration = source["merchant_registration"];
	        this.type_document_id = source["type_document_id"];
	        this.type_organization_id = source["type_organization_id"];
	        this.type_regime_id = source["type_regime_id"];
	        this.type_liability_id = source["type_liability_id"];
	        this.municipality_id = source["municipality_id"];
	        this.software_id = source["software_id"];
	        this.software_pin = source["software_pin"];
	        this.certificate = source["certificate"];
	        this.certificate_password = source["certificate_password"];
	        this.resolution_number = source["resolution_number"];
	        this.resolution_prefix = source["resolution_prefix"];
	        this.resolution_from = source["resolution_from"];
	        this.resolution_to = source["resolution_to"];
	        this.resolution_date_from = this.convertValues(source["resolution_date_from"], time.Time);
	        this.resolution_date_to = this.convertValues(source["resolution_date_to"], time.Time);
	        this.technical_key = source["technical_key"];
	        this.api_url = source["api_url"];
	        this.api_token = source["api_token"];
	        this.test_set_id = source["test_set_id"];
	        this.last_invoice_number = source["last_invoice_number"];
	        this.last_credit_note_number = source["last_credit_note_number"];
	        this.last_debit_note_number = source["last_debit_note_number"];
	        this.send_email = source["send_email"];
	        this.email_host = source["email_host"];
	        this.email_port = source["email_port"];
	        this.email_username = source["email_username"];
	        this.email_password = source["email_password"];
	        this.email_encryption = source["email_encryption"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TaxType {
	    id: number;
	    name: string;
	    code: string;
	    percent: number;
	
	    static createFrom(source: any = {}) {
	        return new TaxType(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	        this.percent = source["percent"];
	    }
	}
	export class Discount {
	    id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new Discount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class DiscrepancyResponse {
	    id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new DiscrepancyResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class PaymentForm {
	    id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new PaymentForm(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class DIANPaymentMethod {
	    id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new DIANPaymentMethod(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class UnitMeasure {
	    id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new UnitMeasure(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class Department {
	    id: number;
	    country_id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new Department(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.country_id = source["country_id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class Municipality {
	    id: number;
	    department_id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new Municipality(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.department_id = source["department_id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class TypeDocument {
	    id: number;
	    name: string;
	    code: string;
	    cufe_algorithm: string;
	    prefix: string;
	
	    static createFrom(source: any = {}) {
	        return new TypeDocument(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	        this.cufe_algorithm = source["cufe_algorithm"];
	        this.prefix = source["prefix"];
	    }
	}
	export class TypeLiability {
	    id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new TypeLiability(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class TypeRegime {
	    id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new TypeRegime(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class TypeOrganization {
	    id: number;
	    name: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new TypeOrganization(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	    }
	}
	export class TypeDocumentIdentification {
	    id: number;
	    name: string;
	    code: string;
	    code_rips?: string;
	
	    static createFrom(source: any = {}) {
	        return new TypeDocumentIdentification(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.code = source["code"];
	        this.code_rips = source["code_rips"];
	    }
	}
	export class DIANParametricData {
	    TypeDocumentIdentifications: Record<number, TypeDocumentIdentification>;
	    TypeOrganizations: Record<number, TypeOrganization>;
	    TypeRegimes: Record<number, TypeRegime>;
	    TypeLiabilities: Record<number, TypeLiability>;
	    TypeDocuments: Record<number, TypeDocument>;
	    Municipalities: Record<number, Municipality>;
	    Departments: Record<number, Department>;
	    UnitMeasures: Record<number, UnitMeasure>;
	    PaymentMethods: Record<number, DIANPaymentMethod>;
	    PaymentForms: Record<number, PaymentForm>;
	    CreditNoteDiscrepancies: Record<number, DiscrepancyResponse>;
	    DebitNoteDiscrepancies: Record<number, DiscrepancyResponse>;
	    Discounts: Record<number, Discount>;
	    TaxTypes: Record<number, TaxType>;
	
	    static createFrom(source: any = {}) {
	        return new DIANParametricData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.TypeDocumentIdentifications = this.convertValues(source["TypeDocumentIdentifications"], TypeDocumentIdentification, true);
	        this.TypeOrganizations = this.convertValues(source["TypeOrganizations"], TypeOrganization, true);
	        this.TypeRegimes = this.convertValues(source["TypeRegimes"], TypeRegime, true);
	        this.TypeLiabilities = this.convertValues(source["TypeLiabilities"], TypeLiability, true);
	        this.TypeDocuments = this.convertValues(source["TypeDocuments"], TypeDocument, true);
	        this.Municipalities = this.convertValues(source["Municipalities"], Municipality, true);
	        this.Departments = this.convertValues(source["Departments"], Department, true);
	        this.UnitMeasures = this.convertValues(source["UnitMeasures"], UnitMeasure, true);
	        this.PaymentMethods = this.convertValues(source["PaymentMethods"], DIANPaymentMethod, true);
	        this.PaymentForms = this.convertValues(source["PaymentForms"], PaymentForm, true);
	        this.CreditNoteDiscrepancies = this.convertValues(source["CreditNoteDiscrepancies"], DiscrepancyResponse, true);
	        this.DebitNoteDiscrepancies = this.convertValues(source["DebitNoteDiscrepancies"], DiscrepancyResponse, true);
	        this.Discounts = this.convertValues(source["Discounts"], Discount, true);
	        this.TaxTypes = this.convertValues(source["TaxTypes"], TaxType, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	
	export class InventoryMovement {
	    id: number;
	    product_id: number;
	    product?: Product;
	    type: string;
	    quantity: number;
	    previous_qty: number;
	    new_qty: number;
	    reference: string;
	    employee_id?: number;
	    employee?: Employee;
	    notes: string;
	    created_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new InventoryMovement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.product_id = source["product_id"];
	        this.product = this.convertValues(source["product"], Product);
	        this.type = source["type"];
	        this.quantity = source["quantity"];
	        this.previous_qty = source["previous_qty"];
	        this.new_qty = source["new_qty"];
	        this.reference = source["reference"];
	        this.employee_id = source["employee_id"];
	        this.employee = this.convertValues(source["employee"], Employee);
	        this.notes = source["notes"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	
	
	
	
	export class PrinterConfig {
	    id: number;
	    name: string;
	    type: string;
	    connection_type: string;
	    address: string;
	    port: number;
	    model: string;
	    paper_width: number;
	    is_default: boolean;
	    is_active: boolean;
	    print_logo: boolean;
	    auto_cut: boolean;
	    cash_drawer: boolean;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new PrinterConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.connection_type = source["connection_type"];
	        this.address = source["address"];
	        this.port = source["port"];
	        this.model = source["model"];
	        this.paper_width = source["paper_width"];
	        this.is_default = source["is_default"];
	        this.is_active = source["is_active"];
	        this.print_logo = source["print_logo"];
	        this.auto_cut = source["auto_cut"];
	        this.cash_drawer = source["cash_drawer"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class RestaurantConfig {
	    id: number;
	    name: string;
	    business_name: string;
	    identification_number: string;
	    dv: string;
	    logo: string;
	    address: string;
	    phone: string;
	    email: string;
	    website: string;
	    department_id?: number;
	    municipality_id?: number;
	    type_regime_id?: number;
	    type_liability_id?: number;
	    type_document_id?: number;
	    type_organization_id?: number;
	    restaurant_mode: string;
	    enable_table_management: boolean;
	    enable_kitchen_display: boolean;
	    enable_waiter_app: boolean;
	    invoice_header: string;
	    invoice_footer: string;
	    show_logo_on_invoice: boolean;
	    default_tax_rate: number;
	    tax_included_in_price: boolean;
	    currency: string;
	    currency_symbol: string;
	    decimal_places: number;
	    opening_time: string;
	    closing_time: string;
	    working_days: string;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new RestaurantConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.business_name = source["business_name"];
	        this.identification_number = source["identification_number"];
	        this.dv = source["dv"];
	        this.logo = source["logo"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.website = source["website"];
	        this.department_id = source["department_id"];
	        this.municipality_id = source["municipality_id"];
	        this.type_regime_id = source["type_regime_id"];
	        this.type_liability_id = source["type_liability_id"];
	        this.type_document_id = source["type_document_id"];
	        this.type_organization_id = source["type_organization_id"];
	        this.restaurant_mode = source["restaurant_mode"];
	        this.enable_table_management = source["enable_table_management"];
	        this.enable_kitchen_display = source["enable_kitchen_display"];
	        this.enable_waiter_app = source["enable_waiter_app"];
	        this.invoice_header = source["invoice_header"];
	        this.invoice_footer = source["invoice_footer"];
	        this.show_logo_on_invoice = source["show_logo_on_invoice"];
	        this.default_tax_rate = source["default_tax_rate"];
	        this.tax_included_in_price = source["tax_included_in_price"];
	        this.currency = source["currency"];
	        this.currency_symbol = source["currency_symbol"];
	        this.decimal_places = source["decimal_places"];
	        this.opening_time = source["opening_time"];
	        this.closing_time = source["closing_time"];
	        this.working_days = source["working_days"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Session {
	    id: number;
	    employee_id: number;
	    employee?: Employee;
	    token: string;
	    device_info: string;
	    ip_address: string;
	    expires_at: time.Time;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new Session(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.employee_id = source["employee_id"];
	        this.employee = this.convertValues(source["employee"], Employee);
	        this.token = source["token"];
	        this.device_info = source["device_info"];
	        this.ip_address = source["ip_address"];
	        this.expires_at = this.convertValues(source["expires_at"], time.Time);
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SyncConfig {
	    id: number;
	    enable_auto_sync: boolean;
	    sync_interval: number;
	    retry_attempts: number;
	    retry_delay: number;
	    last_sync_at?: time.Time;
	    last_sync_status: string;
	    last_sync_error: string;
	    pending_orders: number;
	    pending_invoices: number;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new SyncConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.enable_auto_sync = source["enable_auto_sync"];
	        this.sync_interval = source["sync_interval"];
	        this.retry_attempts = source["retry_attempts"];
	        this.retry_delay = source["retry_delay"];
	        this.last_sync_at = this.convertValues(source["last_sync_at"], time.Time);
	        this.last_sync_status = source["last_sync_status"];
	        this.last_sync_error = source["last_sync_error"];
	        this.pending_orders = source["pending_orders"];
	        this.pending_invoices = source["pending_invoices"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SystemConfig {
	    id: number;
	    key: string;
	    value: string;
	    type: string;
	    category: string;
	    is_locked: boolean;
	    created_at: time.Time;
	    updated_at: time.Time;
	    deleted_at?: gorm.DeletedAt;
	
	    static createFrom(source: any = {}) {
	        return new SystemConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.key = source["key"];
	        this.value = source["value"];
	        this.type = source["type"];
	        this.category = source["category"];
	        this.is_locked = source["is_locked"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	        this.deleted_at = this.convertValues(source["deleted_at"], gorm.DeletedAt);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class TableLayout {
	    id: number;
	    name: string;
	    is_default: boolean;
	    layout: number[];
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new TableLayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.is_default = source["is_default"];
	        this.layout = source["layout"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	export class UITheme {
	    id: number;
	    primary_color: string;
	    secondary_color: string;
	    accent_color: string;
	    background_color: string;
	    text_color: string;
	    font_family: string;
	    font_size: string;
	    button_style: string;
	    dark_mode: boolean;
	    created_at: time.Time;
	    updated_at: time.Time;
	
	    static createFrom(source: any = {}) {
	        return new UITheme(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.primary_color = source["primary_color"];
	        this.secondary_color = source["secondary_color"];
	        this.accent_color = source["accent_color"];
	        this.background_color = source["background_color"];
	        this.text_color = source["text_color"];
	        this.font_family = source["font_family"];
	        this.font_size = source["font_size"];
	        this.button_style = source["button_style"];
	        this.dark_mode = source["dark_mode"];
	        this.created_at = this.convertValues(source["created_at"], time.Time);
	        this.updated_at = this.convertValues(source["updated_at"], time.Time);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace services {
	
	export class CategoryInventoryData {
	    category_id: number;
	    category_name: string;
	    item_count: number;
	    total_value: number;
	
	    static createFrom(source: any = {}) {
	        return new CategoryInventoryData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.category_id = source["category_id"];
	        this.category_name = source["category_name"];
	        this.item_count = source["item_count"];
	        this.total_value = source["total_value"];
	    }
	}
	export class DIANCompanyConfig {
	    type_document_identification_id: number;
	    type_organization_id: number;
	    type_regime_id: number;
	    type_liability_id: number;
	    business_name: string;
	    merchant_registration: string;
	    municipality_id: number;
	    address: string;
	    phone: string;
	    email: string;
	    mail_host: string;
	    mail_port: string;
	    mail_username: string;
	    mail_password: string;
	    mail_encryption: string;
	
	    static createFrom(source: any = {}) {
	        return new DIANCompanyConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type_document_identification_id = source["type_document_identification_id"];
	        this.type_organization_id = source["type_organization_id"];
	        this.type_regime_id = source["type_regime_id"];
	        this.type_liability_id = source["type_liability_id"];
	        this.business_name = source["business_name"];
	        this.merchant_registration = source["merchant_registration"];
	        this.municipality_id = source["municipality_id"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.mail_host = source["mail_host"];
	        this.mail_port = source["mail_port"];
	        this.mail_username = source["mail_username"];
	        this.mail_password = source["mail_password"];
	        this.mail_encryption = source["mail_encryption"];
	    }
	}
	export class DailySalesData {
	    date: string;
	    sales: number;
	    orders: number;
	
	    static createFrom(source: any = {}) {
	        return new DailySalesData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.sales = source["sales"];
	        this.orders = source["orders"];
	    }
	}
	export class DetectedPrinter {
	    name: string;
	    type: string;
	    connection_type: string;
	    address: string;
	    port: number;
	    is_default: boolean;
	    status: string;
	    model: string;
	
	    static createFrom(source: any = {}) {
	        return new DetectedPrinter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.connection_type = source["connection_type"];
	        this.address = source["address"];
	        this.port = source["port"];
	        this.is_default = source["is_default"];
	        this.status = source["status"];
	        this.model = source["model"];
	    }
	}
	export class EmployeePerformanceData {
	    employee_id: number;
	    employee_name: string;
	    total_sales: number;
	    number_of_sales: number;
	    average_sale: number;
	    total_orders: number;
	    working_days: number;
	    cash_difference: number;
	
	    static createFrom(source: any = {}) {
	        return new EmployeePerformanceData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.employee_id = source["employee_id"];
	        this.employee_name = source["employee_name"];
	        this.total_sales = source["total_sales"];
	        this.number_of_sales = source["number_of_sales"];
	        this.average_sale = source["average_sale"];
	        this.total_orders = source["total_orders"];
	        this.working_days = source["working_days"];
	        this.cash_difference = source["cash_difference"];
	    }
	}
	export class EmployeePerformanceReport {
	    period: string;
	    start_date: time.Time;
	    end_date: time.Time;
	    employee_data: EmployeePerformanceData[];
	
	    static createFrom(source: any = {}) {
	        return new EmployeePerformanceReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.period = source["period"];
	        this.start_date = this.convertValues(source["start_date"], time.Time);
	        this.end_date = this.convertValues(source["end_date"], time.Time);
	        this.employee_data = this.convertValues(source["employee_data"], EmployeePerformanceData);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HourlySalesData {
	    hour: number;
	    sales: number;
	    orders: number;
	
	    static createFrom(source: any = {}) {
	        return new HourlySalesData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hour = source["hour"];
	        this.sales = source["sales"];
	        this.orders = source["orders"];
	    }
	}
	export class ProductMovementData {
	    product_id: number;
	    product_name: string;
	    movement_qty: number;
	    current_stock: number;
	
	    static createFrom(source: any = {}) {
	        return new ProductMovementData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.product_id = source["product_id"];
	        this.product_name = source["product_name"];
	        this.movement_qty = source["movement_qty"];
	        this.current_stock = source["current_stock"];
	    }
	}
	export class InventoryReport {
	    generated_at: time.Time;
	    total_products: number;
	    total_value: number;
	    low_stock_items: models.Product[];
	    out_of_stock_items: models.Product[];
	    top_moving_items: ProductMovementData[];
	    category_breakdown: CategoryInventoryData[];
	
	    static createFrom(source: any = {}) {
	        return new InventoryReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.generated_at = this.convertValues(source["generated_at"], time.Time);
	        this.total_products = source["total_products"];
	        this.total_value = source["total_value"];
	        this.low_stock_items = this.convertValues(source["low_stock_items"], models.Product);
	        this.out_of_stock_items = this.convertValues(source["out_of_stock_items"], models.Product);
	        this.top_moving_items = this.convertValues(source["top_moving_items"], ProductMovementData);
	        this.category_breakdown = this.convertValues(source["category_breakdown"], CategoryInventoryData);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PaymentData {
	    payment_method_id: number;
	    amount: number;
	    reference: string;
	
	    static createFrom(source: any = {}) {
	        return new PaymentData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.payment_method_id = source["payment_method_id"];
	        this.amount = source["amount"];
	        this.reference = source["reference"];
	    }
	}
	
	export class ProductSalesData {
	    product_id: number;
	    product_name: string;
	    quantity: number;
	    total_sales: number;
	    percentage: number;
	
	    static createFrom(source: any = {}) {
	        return new ProductSalesData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.product_id = source["product_id"];
	        this.product_name = source["product_name"];
	        this.quantity = source["quantity"];
	        this.total_sales = source["total_sales"];
	        this.percentage = source["percentage"];
	    }
	}
	export class SalesReport {
	    period: string;
	    start_date: time.Time;
	    end_date: time.Time;
	    total_sales: number;
	    total_tax: number;
	    total_discounts: number;
	    number_of_sales: number;
	    average_sale: number;
	    payment_breakdown: Record<string, number>;
	    top_products: ProductSalesData[];
	    hourly_sales: HourlySalesData[];
	    daily_sales: DailySalesData[];
	
	    static createFrom(source: any = {}) {
	        return new SalesReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.period = source["period"];
	        this.start_date = this.convertValues(source["start_date"], time.Time);
	        this.end_date = this.convertValues(source["end_date"], time.Time);
	        this.total_sales = source["total_sales"];
	        this.total_tax = source["total_tax"];
	        this.total_discounts = source["total_discounts"];
	        this.number_of_sales = source["number_of_sales"];
	        this.average_sale = source["average_sale"];
	        this.payment_breakdown = source["payment_breakdown"];
	        this.top_products = this.convertValues(source["top_products"], ProductSalesData);
	        this.hourly_sales = this.convertValues(source["hourly_sales"], HourlySalesData);
	        this.daily_sales = this.convertValues(source["daily_sales"], DailySalesData);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace time {
	
	export class Time {
	
	
	    static createFrom(source: any = {}) {
	        return new Time(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}

}

