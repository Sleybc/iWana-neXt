/**
 * DTO para paginacion basada en cursor (keyset pagination).
 * Aplica a todos los endpoints de listado en la plataforma.
 */
export interface PaginationQueryDto {
    /** Cursor opaco para la siguiente pagina */
    cursor?: string;
    /** Numero maximo de elementos a retornar (default: 50) */
    limit?: number;
}
//# sourceMappingURL=pagination.dto.d.ts.map