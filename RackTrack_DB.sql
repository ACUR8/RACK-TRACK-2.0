CREATE DATABASE racktrack_db;
USE racktrack_db;

-- =========================================
-- 1) USERS	(Goods)
-- =========================================

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    
    surname VARCHAR (50) NOT NULL, 
    first_name VARCHAR (50) NOT NULL, 
    middle_initial VARCHAR(10) DEFAULT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE, 
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
    
    -- account_status ENUM('pending', 'active', 'inactive', 'blocked') DEFAULT 'pending',
	-- failed_attempts INT DEFAULT 0,
	-- lock_until DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- =========================================
-- 2) CATEGORIES (Goods)
-- =========================================

CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    
    category_name VARCHAR(50) NOT NULL UNIQUE,
    category_color VARCHAR(20) DEFAULT '#2f8d46',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- =========================================
-- 3) PRODUCTS (Goods)
-- =========================================

USE racktrack_db;

CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,

    barcode VARCHAR(30) NOT NULL UNIQUE, -- This is the Unique barcode named "Product Code"
    sku VARCHAR(100) NOT NULL UNIQUE,

    supplier VARCHAR(50),
    product_name VARCHAR(100) NOT NULL,
    color VARCHAR(50) NOT NULL, -- This should be the dominant color of the shirt. NO 'GreenYellow" inputs
    size VARCHAR(20) NOT NULL,
    material VARCHAR(50) NOT NULL,
    category_id INT NOT NULL,
	description TEXT DEFAULT NULL,

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

-- goods 
INSERT INTO products (
    barcode, sku, supplier, product_name, color, size, material, category_id, cost, srp, image_path, status
) VALUES
('RT-PRD-00001', 'CB-AGR-M-COT-LGSL', 'LaCreacion', 'Cherry Blossom', 'Acid Gray', 'M', 'Cotton', 3, 250.00, 499.00, NULL, 'active'),
('RT-PRD-00002', 'CB-AGR-L-COT-LGSL', 'LaCreacion', 'Cherry Blossom', 'Acid Gray', 'L', 'Cotton', 3, 250.00, 499.00, NULL, 'active'),
('RT-PRD-00003', 'ESS-BLK-M-POL-SHRT', 'LaCreacion', 'Essential Tee', 'Black', 'M', 'Polyester', 1, 180.00, 350.00, NULL, 'active');


-- =========================================
-- 4) INVENTORY (Goods)
-- =========================================

CREATE TABLE inventory (
    inventory_id INT AUTO_INCREMENT PRIMARY KEY,
    
	product_id INT NOT NULL UNIQUE,
    
    quantity INT NOT NULL DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_inventory_productID
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);



-- =========================================
-- 5) CUSTOMERS (Goods)
-- =========================================

CREATE TABLE customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    
    customer_name VARCHAR(100) NOT NULL,
    contact VARCHAR(50) DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO customers (customer_name, contact, address) VALUES
('Walk-in Customer', NULL, NULL),
('Juan Dela Cruz', '09123456789', 'Quezon City'),
('Maria Santos', '09987654321', 'Makati');


-- =========================================
-- 6) SALES 
-- =========================================

CREATE TABLE sales (
    sale_id INT AUTO_INCREMENT PRIMARY KEY,
    
    receipt_no VARCHAR(50) NOT NULL UNIQUE,
    
    customer_id INT NOT NULL,
    cashier_id INT NOT NULL, 
    
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    change_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    note TEXT DEFAULT NULL,
    payment_method ENUM('cash', 'e-money', 'online bank') DEFAULT 'cash',
    sale_status ENUM('completed', 'voided', 'refunded') DEFAULT 'completed',
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sales_customerID
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_sales_cashierID
        FOREIGN KEY (cashier_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);


-- =========================================
-- 7) SALE_ITEMS (Goods)
-- =========================================

SELECT * FROM SALE_ITEMS;

CREATE TABLE sale_items (
    sale_item_id INT AUTO_INCREMENT PRIMARY KEY,
    
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    
    quantity INT NOT NULL DEFAULT 1,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    srp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    line_profit DECIMAL(10,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT fk_sale_items_saleID
        FOREIGN KEY (sale_id) REFERENCES sales(sale_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_sale_items_productID
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- =========================================
-- 8) STOCK_MOVEMENTS (Goods, this is used for "Inventory Movement History")
-- =========================================

CREATE TABLE stock_movements (			
    movement_id INT AUTO_INCREMENT PRIMARY KEY,
    
    product_id INT NOT NULL,
    
    movement_type ENUM('Stock In', 'Stock Out', 'Sold', 'Adjustment', 'Void', 'Refund') NOT NULL,
    quantity_before INT NOT NULL,
    quantity_change INT NOT NULL,
    note TEXT DEFAULT NULL,
    quantity_after INT NOT NULL,
    reference_type ENUM('purchase', 'sale', 'void', 'refund', 'manual') DEFAULT 'manual',
    reference_id INT DEFAULT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_stock_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_stock_user
        FOREIGN KEY (created_by) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);



-- =========================================
-- System Settings
-- =========================================




-- =========================================
-- System Settings
-- =========================================






-- =========================================
-- VOID_TRANSACTIONS (STAFF VIEW)
-- =========================================
CREATE TABLE void_transactions (
    void_id INT AUTO_INCREMENT PRIMARY KEY,
    sale_item_id INT NOT NULL,
    reason VARCHAR(100) NOT NULL,
    note TEXT DEFAULT NULL,
    authorized_by INT NOT NULL,
    void_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_void_sale_itemID
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(sale_item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_void_userID
        FOREIGN KEY (authorized_by) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

INSERT INTO void_transactions (
    sale_item_id, reason, note, authorized_by
) VALUES
(1, 'Wrong Item', 'Customer selected incorrect size', 1),
(2, 'Duplicate Transaction', 'Scanned twice', 1);

-- =========================================
-- REFUND_TRANSACTIONS (FUTURE FEATURE)
-- =========================================
select * from refund_transactions;

CREATE TABLE refund_transactions (
    refund_id INT AUTO_INCREMENT PRIMARY KEY,
    sale_item_id INT NOT NULL,
    reason VARCHAR(100) NOT NULL,
    note TEXT DEFAULT NULL,
    refunded_by INT NOT NULL,
    refund_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_refund_sale_itemID
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(sale_item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_refund_userID
        FOREIGN KEY (refunded_by) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

INSERT INTO refund_transactions (
    sale_item_id, reason, note, refunded_by
) VALUES
(3, 'Damaged Item', 'Customer returned item with issue', 1),
(2, 'Wrong Size', 'Requested exchange/refund after fitting', 1);
