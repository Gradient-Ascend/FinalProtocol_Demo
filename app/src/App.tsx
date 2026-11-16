import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import PreviewIntro from './pages/PreviewIntro'
import PreviewMap from './pages/PreviewMap'
import PreviewStage from './pages/PreviewStage'

// "/" is the game. The preview routes mount one display on its own, for
// building and checking it: #/preview/intro, #/preview/map, #/preview/stage.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/preview/intro" element={<PreviewIntro />} />
      <Route path="/preview/map" element={<PreviewMap />} />
      <Route path="/preview/stage" element={<PreviewStage />} />
    </Routes>
  )
}
