import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../supabaseClient'

// Default Leaflet marker icons don't load correctly with bundlers unless
// pointed at the CDN copies explicitly.
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const DES_MOINES_CENTER = [41.5868, -93.625]

export default function ChurchMap() {
  const [churches, setChurches] = useState([])

  useEffect(() => {
    async function loadChurches() {
      const { data, error } = await supabase.from('churches').select('*')
      if (!error && data) {
        setChurches(data)
      }
    }
    loadChurches()
  }, [])

  return (
    <MapContainer
      center={DES_MOINES_CENTER}
      zoom={11}
      scrollWheelZoom={false}
      className="church-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {churches.map((church) => (
        <Marker
          key={church.id}
          position={[church.latitude, church.longitude]}
          icon={markerIcon}
        >
          <Popup>
            <strong>{church.name}</strong>
            <br />
            {church.address}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}