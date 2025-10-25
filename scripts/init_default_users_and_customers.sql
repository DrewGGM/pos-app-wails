-- ============================================================
-- Script para crear el usuario administrador y cliente por defecto
-- Este script debe ejecutarse UNA SOLA VEZ después de crear la base de datos
-- ============================================================

-- ⚙️ Credenciales por defecto del administrador:
-- Username: admin
-- Password: admin
-- PIN: 12345
-- ⚠️ IMPORTANTE: Cambiar estas credenciales después del primer login

-- ============================================================
-- 🧑‍💻 Crear usuario administrador inicial
-- ============================================================

INSERT INTO employees (
    name,
    username,
    password,
    pin,
    role,
    email,
    is_active,
    created_at,
    updated_at
)
VALUES (
    'Administrador',
    'admin',
    '$2a$10$ASVN2q6/JJVwfE4na3Ze/elb40oe32smjIRClrOBoKfyi7PY2exH6', -- password: admin123
    '$2a$10$A.68B1.ATZxuOMYc2QpKbuDvu1wPlbhF/Vxap546P3d8uBTHh4FsC',  -- pin: 1234
    'admin',
    'admin@restaurant.com',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (username) DO NOTHING;

-- Verificar que se creó correctamente
SELECT id, name, username, role, email, is_active
FROM employees
WHERE username = 'admin';

-- ============================================================
-- 👥 Crear cliente por defecto: CONSUMIDOR FINAL
-- ============================================================

INSERT INTO customers (
    id,
    identification_type,
    identification_number,
    dv,
    name,
    email,
    phone,
    address,
    municipality_id,
    type_organization_id,
    type_liability_id,
    type_regime_id,
    is_active,
    created_at,
    updated_at,
    deleted_at,
    type_document_identification_id,
    merchant_registration
)
VALUES (
    3,
    'RC',
    '222222222222',
    NULL,
    'CONSUMIDOR FINAL',
    '',
    '0',
    'NO REGISTRADO',
    NULL,
    2,
    117,
    2,
    TRUE,
    '2025-10-24 14:45:23.530056-05',
    '2025-10-24 14:45:23.530056-05',
    NULL,
    NULL,
    NULL
)
ON CONFLICT (identification_number) DO NOTHING;

-- Verificar que se creó correctamente
SELECT id, identification_type, identification_number, name, is_active
FROM customers
WHERE identification_number = '222222222222';
