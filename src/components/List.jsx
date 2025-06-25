import { useState, useEffect } from 'react'
import { DataGrid } from '@mui/x-data-grid'

const List = () => {
  const [rows, setRows] = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/data/short_term_lets.csv')
        if (!response.ok) {
          throw new Error('Failed to load data')
        }
        
        const csvText = await response.text()
        const lines = csvText.split('\n').filter(line => line.trim())
        
        if (lines.length === 0) {
          throw new Error('No data found')
        }
        
        // Parse headers
        const headers = lines[0].split('|').map(header => header.trim().replace(/"/g, ''))
        
        // Parse rows and filter out empty rows
        const dataRows = lines.slice(1)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map((line, index) => {
            const values = line.split('|').map(value => value.trim().replace(/"/g, ''))
            const row = { id: `row_${index}` }
            headers.forEach((header, headerIndex) => {
              row[header] = values[headerIndex] || ''
            })
            return row
          })
          .filter(row => {
            // Filter out rows that are completely empty
            const hasData = headers.some(header => row[header] && row[header].trim() !== '')
            return hasData
          })
        
        // Detect column types and create column definitions
        const columnDefs = headers.map(header => {
          const headerLower = header.toLowerCase()
          const isDateColumn = headerLower.includes('date')
          const isNumberColumn = headerLower.includes('number') || 
                                 headerLower.includes('occupancy') || 
                                 headerLower.includes('bedroom')
          
          const columnDef = {
            field: header,
            headerName: header,
            width: 200,
            sortable: true,
            filterable: true,
            type: 'string'  // Use string type for all to avoid MUI conversion issues
          }
          
          // Add custom sorting for dates and numbers
          if (isDateColumn) {
            columnDef.sortComparator = (v1, v2) => {
              const parseDate = (dateStr) => {
                if (!dateStr || String(dateStr).trim() === '') return new Date(0)
                const str = String(dateStr).trim()
                if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
                  const [day, month, year] = str.split('/')
                  return new Date(year, month - 1, day)
                }
                return new Date(str)
              }
              
              const date1 = parseDate(v1)
              const date2 = parseDate(v2)
              return date1.getTime() - date2.getTime()
            }
          } else if (isNumberColumn) {
            columnDef.sortComparator = (v1, v2) => {
              const parseNumber = (numStr) => {
                if (!numStr || String(numStr).trim() === '') return 0
                const num = parseFloat(String(numStr).replace(/[^\d.-]/g, ''))
                return isNaN(num) ? 0 : num
              }
              
              const num1 = parseNumber(v1)
              const num2 = parseNumber(v2)
              return num1 - num2
            }
          }
          
          return columnDef
        })
        
        setColumns(columnDefs)
        setRows(dataRows)
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        pagination
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: {
            paginationModel: { pageSize: 25 }
          }
        }}
        disableRowSelectionOnClick
      />
    </div>
  )
}

export default List