-- Script para crear el usuario administrador inicial
-- Este script debe ejecutarse UNA SOLA VEZ después de crear la base de datos

-- Credenciales por defecto:
-- Username: admin
-- Password: admin123
-- PIN: 1234
--
-- ⚠️ IMPORTANTE: Cambiar estas credenciales inmediatamente después del primer login

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
    '$2a$10$ASVN2q6/JJVwfE4na3Ze/elb40oe32smjIRClrOBoKfyi7PY2exH6', -- password: admin
    '$2a$10$A.68B1.ATZxuOMYc2QpKbuDvu1wPlbhF/Vxap546P3d8uBTHh4FsC',  -- pin: 12345
    'admin',
    'admin@restaurant.com',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (username) DO NOTHING;

-- Verificar que se creó correctamente
SELECT id, name, username, role, email, is_active
FROM employees
WHERE username = 'admin';
