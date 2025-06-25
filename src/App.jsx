import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Map from './components/Map'
import List from './components/List'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Map />} />
        <Route path="/list" element={<List />} />
      </Routes>
    </Router>
  )
}

export default App
