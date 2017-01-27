import MobileDetect from 'mobile-detect'
import canvas from './source/Canvas'
import ui from './source/Ui'
import metrics from './source/Metrics'
import exporter from './source/file/Exporter'
import importer from './source/file/Importer'
import datasetResource from './source/resources/DatasetResource'
import geographyResource from './source/resources/GeographyResource'
import tilegramResource from './source/resources/TilegramResource'
import gridGeometry from './source/geometry/GridGeometry'
import {startDownload, isDevEnvironment} from './source/utils'
import {updateCanvasSize} from './source/constants'

require('./source/css/main.scss')
require('font-awesome/scss/font-awesome.scss')

const CARTOGRAM_COMPUTE_FPS = 60.0

let cartogramComputeTimer

let importing = false
const defaultGeography = 'United States'

if (typeof window !== 'undefined') {
  const mobileDetect = new MobileDetect(window.navigator.userAgent)
  const isMobile = mobileDetect.mobile()
  if (isMobile) {
    document.body.className = 'isMobile'
  }
}

function selectDataset(geography, index) {
  const dataset = datasetResource.getDataset(geography, index)
  importing = false
  ui.setSelectedDataset(dataset)
  canvas.computeCartogram(dataset)
  clearInterval(cartogramComputeTimer)
  cartogramComputeTimer = setInterval(() => {
    const iterated = canvas.iterateCartogram(dataset.geography)
    if (iterated) {
      canvas.updateTilesFromMetrics()
    }
  }, 1000.0 / CARTOGRAM_COMPUTE_FPS)
}

function updateUi() {
  ui.setTiles(canvas.getGrid().getTiles())
  ui.render()
}

function loadTopoJson(topoJson) {
  importing = true
  const {tiles, metricPerTile} = importer.fromTopoJson(topoJson)
  const dataset = datasetResource.buildDatasetFromTiles(tiles)

  ui.setSelectedDataset(dataset)
  metrics.metricPerTile = metricPerTile
  canvas.importTiles(tiles)
  updateUi()
}

function selectGeography(geography) {
  /**
  * Geography dropdown loads first pre-made tilegram if it exists, else loads first associated
  * dataset and generates a new tilegram.
  */
  importing = false
  const datasets = datasetResource.getDatasetsByGeography(geography)
  const tilegrams = tilegramResource.getTilegramsByGeography(geography)
  const geoCodeToName = geographyResource.getGeoCodeHash(geography)
  ui.setGeography(geography)
  ui.setDatasetLabels(datasets.map(dataset => dataset.label))
  ui.setTilegramLabels(tilegrams.map(tilegram => tilegram.label))
  ui.setGeos(geographyResource.getMapResource(geography).getUniqueFeatureIds())
  ui.setGeoCodeToName(geoCodeToName)
  canvas.setGeoCodeToName(geoCodeToName)
  if (tilegrams.length) {
    loadTopoJson(tilegrams[0].topoJson)
  } else {
    document.getElementById('generate-tilegram').click()
    const dataset = datasets[0]
    ui.setSelectedDataset(dataset)
    canvas.computeCartogram(dataset)
    clearInterval(cartogramComputeTimer)
    cartogramComputeTimer = setInterval(() => {
      const iterated = canvas.iterateCartogram(geography)
      if (iterated) {
        canvas.updateTilesFromMetrics()
      }
    }, 1000.0 / CARTOGRAM_COMPUTE_FPS)
  }
  updateUi()
}

function confirmNavigation(e) {
  // most browsers won't let you display custom text but have something like this anyway
  const message = 'Are you sure you want to leave this page? You will lose any unsaved work.'
  e.returnValue = message
  return message
}

function init() {
  // wire up callbacks
  canvas.getGrid().onChange(() => updateUi())
  canvas.getGrid().setUiEditingCallback(() => ui.setEditingTrue())
  ui.setAddTileCallback(id => canvas.getGrid().onAddTileMouseDown(id))
  ui.setDatasetSelectedCallback((geography, index) => selectDataset(geography, index))
  ui.setTilegramSelectedCallback((geography, index) => {
    loadTopoJson(tilegramResource.getTilegram(geography, index))
  })
  ui.setCustomDatasetCallback(csv => selectDataset(datasetResource.parseCsv(csv)))
  ui.setHightlightCallback(id => canvas.getGrid().onHighlightGeo(id))
  ui.setUnhighlightCallback(() => canvas.getGrid().resetHighlightedGeo())
  ui.setResolutionChangedCallback((metricPerTile, sumMetrics) => {
    if (importing) {
      return
    }
    metrics.metricPerTile = metricPerTile
    metrics.sumMetrics = sumMetrics
    canvas.updateTilesFromMetrics()
  })
  ui.setUnsavedChangesCallback(() => canvas.getGrid().checkForEdits())
  ui.setResetUnsavedChangesCallback(() => canvas.getGrid().resetEdits())
  ui.setExportCallback(() => {
    const json = exporter.toTopoJson(
      canvas.getGrid().getTiles(),
      metrics.metricPerTile
    )
    startDownload({
      filename: 'tiles.topo.json',
      mimeType: 'application/json',
      content: JSON.stringify(json),
    })
  })
  ui.setExportSvgCallback(() => {
    const svg = exporter.toSvg(canvas.getGrid().getTiles())
    startDownload({
      filename: 'tiles.svg',
      mimeType: 'image/svg+xml',
      content: svg,
    })
  })
  ui.setImportCallback(loadTopoJson)
  ui.setGeographySelectCallback(selectGeography)

  // populate
  selectGeography(defaultGeography)
  updateUi()
  if (!isDevEnvironment()) {
    window.addEventListener('beforeunload', confirmNavigation)
  }
}

function resize() {
  updateCanvasSize()
  canvas.resize()
  gridGeometry.resize()
  canvas.getMap().updatePreProjection()
}
window.onresize = resize
resize()

// Ignore ctrl-Z altogether
document.addEventListener('keydown', event => {
  if (event.metaKey && event.key === 'z') {
    event.preventDefault()
  }
})

init()
