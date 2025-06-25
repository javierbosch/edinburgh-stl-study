import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const Map = () => {
  const edinburghCenter = [55.9533, -3.1883]
  const zoomLevel = 13

  return (
    <MapContainer
      center={edinburghCenter}
      zoom={zoomLevel}
      style={{ height: '100vh', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
    </MapContainer>
  )
}

export default Map