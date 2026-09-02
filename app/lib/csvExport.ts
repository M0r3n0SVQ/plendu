import { ALERTA_MESSAGES, MERCADOS } from './vintedOptions'
import type { HistorialItem } from './historial'

// Quotes a CSV field and doubles any internal quotes (RFC 4180)
function csvField(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function historialToCSV(historial: HistorialItem[]): string {
  const headers = [
    'Fecha', 'Mercado', 'Título', 'Descripción', 'Precio', 'Estado', 'Categoría', 'Marca', 'Talla', 'Medidas',
    'Campos estimados', 'Alerta', 'Vendida', 'Precio de venta',
  ]
  const rows = historial.map(item => [
    item.fecha,
    MERCADOS[item.ficha.mercado]?.nombre || '',
    item.ficha.titulo,
    item.ficha.descripcion,
    item.ficha.precio,
    item.ficha.estado,
    item.ficha.categoria,
    item.ficha.marca,
    item.ficha.talla,
    item.ficha.medidas || '',
    Array.isArray(item.ficha.camposDudosos) ? item.ficha.camposDudosos.join('; ') : '',
    (item.ficha.alerta && ALERTA_MESSAGES[item.ficha.alerta as keyof typeof ALERTA_MESSAGES]) || '',
    item.vendida ? 'Sí' : 'No',
    item.vendida && item.precioVenta != null ? item.precioVenta : '',
  ])
  // Leading BOM so Excel detects UTF-8 instead of mangling acentos/€
  return '﻿' + [headers, ...rows].map(row => row.map(csvField).join(',')).join('\r\n')
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
