'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PRODUCT_CATEGORY_LABELS = exports.ProductCategory = void 0;
/**
 * Categoría de producto o equipo en el catálogo comercial.
 * Extiende los valores originales de AdditionalProductCategory con
 * nuevas categorías para red y CPE (Customer Premises Equipment).
 */
var ProductCategory;
(function (ProductCategory) {
  ProductCategory['ENTERTAINMENT'] = 'ENTERTAINMENT';
  ProductCategory['SECURITY'] = 'SECURITY';
  ProductCategory['CONNECTIVITY'] = 'CONNECTIVITY';
  ProductCategory['BUSINESS'] = 'BUSINESS';
  ProductCategory['NETWORKING'] = 'NETWORKING';
  ProductCategory['CPE'] = 'CPE';
})(ProductCategory || (exports.ProductCategory = ProductCategory = {}));
exports.PRODUCT_CATEGORY_LABELS = {
  [ProductCategory.ENTERTAINMENT]: 'Entretenimiento',
  [ProductCategory.SECURITY]: 'Seguridad',
  [ProductCategory.CONNECTIVITY]: 'Conectividad',
  [ProductCategory.BUSINESS]: 'Negocios',
  [ProductCategory.NETWORKING]: 'Red',
  [ProductCategory.CPE]: 'Equipo cliente (CPE)',
};
//# sourceMappingURL=product-category.enum.js.map
