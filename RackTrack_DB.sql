CREATE DATABASE racktrack_db;
USE racktrack_db;

-- =========================================
-- 1) USERS
-- =========================================
SELECT * FROM users;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'cashier', 'manager') NOT NULL DEFAULT 'cashier',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (full_name, username, password_hash, role)
VALUES
('System Administrator', 'admin', 'admin123', 'admin');

-- =========================================
-- 2) CATEGORIES
-- =========================================
SELECT * FROM categories;

CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL UNIQUE,
    category_color VARCHAR(20) DEFAULT '#2f8d46',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO categories (category_name, category_color) VALUES
('T-Shirt', '#2f8d46'),
('Hoodie', '#2e63bf'),
('Long Sleeve', '#f2b14c'),
('Sweat Pants', '#c94848');

-- =========================================
-- 3) PRODUCTS
-- =========================================
SELECT * FROM products;

ALTER TABLE products 
ADD Supplier VARCHAR(50);

ALTER TABLE products  
MODIFY COLUMN Supplier VARCHAR(50) AFTER sku;

CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    barcode VARCHAR(50) NOT NULL UNIQUE,
    sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    color VARCHAR(50) NOT NULL,
    size VARCHAR(20) NOT NULL,
    material VARCHAR(50) NOT NULL,
    category_id INT NOT NULL,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    srp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    image_path VARCHAR(255) DEFAULT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_products_categoryID
        FOREIGN KEY (category_id) REFERENCES categories(category_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

INSERT INTO products (
    barcode, sku, product_name, color, size, material, category_id, cost, srp, image_path, status
) VALUES
('100000000001', 'CB-AGR-M-LS', 'Cherry Blossom', 'Acid Gray', 'M', 'Cotton', 3, 250.00, 499.00, NULL, 'active'),
('100000000002', 'CB-AGR-L-LS', 'Cherry Blossom', 'Acid Gray', 'L', 'Cotton', 3, 250.00, 499.00, NULL, 'active'),
('100000000003', 'ESS-BLK-M-TS', 'Essential Tee', 'Black', 'M', 'Polyester', 1, 180.00, 350.00, NULL, 'active');

-- =========================================
-- 4) INVENTORY
-- =========================================
SELECT * FROM INVENTORY;

CREATE TABLE inventory (
    inventory_id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_inventory_productID
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

INSERT INTO inventory (product_id, quantity, low_stock_threshold) VALUES
(1, 50, 5),
(2, 30, 5),
(3, 100, 5);

-- =========================================
-- 2) CATEGORIES
-- =========================================

