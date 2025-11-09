-- ========================================
-- DIAGNÓSTICO DE CAJA REGISTRADORA
-- ========================================

-- 1. Ver la caja abierta actual
SELECT
    cr.id,
    cr.employee_id,
    e.name as empleado,
    cr.opening_amount,
    cr.expected_amount,
    cr.status,
    cr.opened_at
FROM cash_registers cr
JOIN employees e ON e.id = cr.employee_id
WHERE cr.status = 'open'
ORDER BY cr.opened_at DESC
LIMIT 1;

-- 2. Ver TODAS las ventas de la caja actual (reemplaza <CASH_REGISTER_ID> con el ID de arriba)
-- IMPORTANTE: Cambia el número después de WHERE por el ID de tu caja abierta
SELECT
    s.id,
    s.sale_number,
    s.total,
    s.status,
    s.created_at,
    s.cash_register_id
FROM sales s
WHERE s.cash_register_id = (SELECT id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1)
ORDER BY s.created_at DESC;

-- 3. Ver los PAGOS de cada venta con sus métodos de pago
SELECT
    s.sale_number,
    s.total as venta_total,
    pm.name as metodo_pago,
    pm.type as tipo,
    pm.affects_cash_register,
    pm.show_in_cash_summary,
    p.amount as monto_pago
FROM sales s
JOIN payments p ON p.sale_id = s.id
JOIN payment_methods pm ON pm.id = p.payment_method_id
WHERE s.cash_register_id = (SELECT id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1)
ORDER BY s.created_at DESC, pm.name;

-- 4. SUMA POR MÉTODO DE PAGO (esto debería coincidir con lo que muestra la app)
SELECT
    pm.name as metodo_pago,
    pm.type as tipo,
    pm.affects_cash_register,
    pm.show_in_cash_summary,
    COUNT(p.id) as cantidad_pagos,
    SUM(p.amount) as total_por_metodo
FROM sales s
JOIN payments p ON p.sale_id = s.id
JOIN payment_methods pm ON pm.id = p.payment_method_id
WHERE s.cash_register_id = (SELECT id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1)
  AND s.status NOT IN ('refunded', 'partial_refund')
GROUP BY pm.name, pm.type, pm.affects_cash_register, pm.show_in_cash_summary
ORDER BY total_por_metodo DESC;

-- 5. Verificar si hay ventas DUPLICADAS
SELECT
    s.sale_number,
    COUNT(*) as veces_que_aparece,
    STRING_AGG(s.id::text, ', ') as sale_ids
FROM sales s
WHERE s.cash_register_id = (SELECT id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1)
GROUP BY s.sale_number
HAVING COUNT(*) > 1;

-- 6. Verificar si hay PAGOS DUPLICADOS para una misma venta
SELECT
    s.sale_number,
    pm.name as metodo_pago,
    COUNT(p.id) as cantidad_pagos,
    SUM(p.amount) as total_pagos
FROM sales s
JOIN payments p ON p.sale_id = s.id
JOIN payment_methods pm ON pm.id = p.payment_method_id
WHERE s.cash_register_id = (SELECT id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1)
GROUP BY s.sale_number, pm.name
HAVING COUNT(p.id) > 1
ORDER BY s.sale_number;

-- 7. Ver TODOS los métodos de pago configurados
SELECT
    id,
    name,
    type,
    affects_cash_register,
    show_in_cash_summary,
    show_in_reports,
    is_active
FROM payment_methods
WHERE is_active = true
ORDER BY display_order;

-- 8. SUMA TOTAL de ventas VS SUMA de pagos (deben ser iguales)
SELECT
    SUM(s.total) as suma_total_ventas,
    (SELECT SUM(p.amount) FROM payments p
     JOIN sales s2 ON s2.id = p.sale_id
     WHERE s2.cash_register_id = (SELECT id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1)
       AND s2.status NOT IN ('refunded', 'partial_refund')
    ) as suma_total_pagos
FROM sales s
WHERE s.cash_register_id = (SELECT id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1)
  AND s.status NOT IN ('refunded', 'partial_refund');

-- 9. Ver movimientos de caja (depósitos y retiros)
SELECT
    cm.type,
    cm.amount,
    cm.description,
    cm.reason,
    cm.created_at
FROM cash_movements cm
WHERE cm.cash_register_id = (SELECT id FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1)
ORDER BY cm.created_at DESC;

-- 10. CÁLCULO ESPERADO (igual a como lo hace el backend)
WITH caja AS (
    SELECT id, opening_amount FROM cash_registers WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1
)
SELECT
    'Apertura' as concepto,
    (SELECT opening_amount FROM caja) as monto
UNION ALL
SELECT
    'Ventas en Efectivo (affects_cash_register=true)' as concepto,
    COALESCE(SUM(p.amount), 0) as monto
FROM payments p
JOIN sales s ON s.id = p.sale_id
JOIN payment_methods pm ON pm.id = p.payment_method_id
WHERE s.cash_register_id = (SELECT id FROM caja)
  AND pm.affects_cash_register = true
  AND s.status NOT IN ('refunded', 'partial_refund')
UNION ALL
SELECT
    'Salidas (withdrawals)' as concepto,
    -COALESCE(SUM(cm.amount), 0) as monto
FROM cash_movements cm
WHERE cm.cash_register_id = (SELECT id FROM caja)
  AND cm.type = 'withdrawal'
UNION ALL
SELECT
    'TOTAL ESPERADO' as concepto,
    (SELECT opening_amount FROM caja) +
    COALESCE((SELECT SUM(p.amount) FROM payments p
              JOIN sales s ON s.id = p.sale_id
              JOIN payment_methods pm ON pm.id = p.payment_method_id
              WHERE s.cash_register_id = (SELECT id FROM caja)
                AND pm.affects_cash_register = true
                AND s.status NOT IN ('refunded', 'partial_refund')), 0) -
    COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm
              WHERE cm.cash_register_id = (SELECT id FROM caja)
                AND cm.type = 'withdrawal'), 0) as monto;
