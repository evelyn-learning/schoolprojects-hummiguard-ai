'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface AnalysisResult {
  level: number
  confidence: 'high' | 'medium' | 'low'
  description: string
  feeder_visible: boolean
  timestamp?: string
  raw?: string
}

interface HistoryEntry {
  level: number
  time: string
  confidence: 'high' | 'medium' | 'low'
}

// Extend Window interface for webkit audio context
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext
  }
}

export default function HummiGuardAI() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const [isRunning, setIsRunning] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [nectarLevel, setNectarLevel] = useState<number | null>(null)
  const [alertActive, setAlertActive] = useState(false)
  const [alertMuted, setAlertMuted] = useState(false)
  const [threshold, setThreshold] = useState(25)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [lastAnalysis, setLastAnalysis] = useState<AnalysisResult | null>(null)
  const [analysisInterval, setAnalysisInterval] = useState(30)
  const [countdown, setCountdown] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setIsRunning(true)
        setCameraError(null)
        setCountdown(5)
      }
    } catch (err) {
      setCameraError('Camera access denied. Please allow camera permissions and refresh.')
      console.error('Camera error:', err)
    }
  }

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
    }
    setIsRunning(false)
    setAlertActive(false)
    setCountdown(0)
  }

  // Capture frame as base64
  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480

    ctx.drawImage(video, 0, 0)

    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    return base64
  }

  // Call our API route to analyze the image
  const analyzeWithAI = async () => {
    if (isAnalyzing) return

    setIsAnalyzing(true)

    try {
      const imageBase64 = captureFrame()
      if (!imageBase64) {
        throw new Error('Failed to capture frame')
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageBase64 })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'API request failed')
      }

      const result: AnalysisResult = await response.json()
      const timestamp = new Date().toLocaleTimeString()

      setLastAnalysis({
        ...result,
        timestamp,
      })

      if (result.feeder_visible && result.level >= 0) {
        setNectarLevel(result.level)

        setHistory(prev => [...prev.slice(-19), {
          level: result.level,
          time: timestamp,
          confidence: result.confidence
        }])

        if (result.level < threshold) {
          setAlertActive(true)
        } else {
          setAlertActive(false)
        }
      }

    } catch (err) {
      console.error('AI Analysis error:', err)
      setLastAnalysis({
        level: -1,
        confidence: 'low',
        description: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        feeder_visible: false,
        timestamp: new Date().toLocaleTimeString()
      })
    } finally {
      setIsAnalyzing(false)
      setCountdown(analysisInterval)
    }
  }

  // Play alert sound
  const playAlertSound = useCallback(() => {
    if (alertMuted) return

    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        audioContextRef.current = new AudioContextClass()
      }

      const ctx = audioContextRef.current
      if (ctx.state === 'suspended') ctx.resume()

      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.setValueAtTime(1200, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1)
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)

      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.2)
    } catch (e) {
      console.log('Audio not available')
    }
  }, [alertMuted])

  // Countdown timer
  useEffect(() => {
    if (!isRunning || countdown <= 0) return

    const timer = setTimeout(() => {
      setCountdown(c => c - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [isRunning, countdown])

  // Trigger analysis when countdown reaches 0
  useEffect(() => {
    if (isRunning && countdown === 0 && !isAnalyzing) {
      analyzeWithAI()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, isRunning, isAnalyzing])

  // Alert sound loop
  useEffect(() => {
    if (!alertActive || alertMuted) return

    const interval = setInterval(playAlertSound, 2000)
    playAlertSound()
    return () => clearInterval(interval)
  }, [alertActive, alertMuted, playAlertSound])

  const getConfidenceColor = (conf: string): string => {
    switch(conf) {
      case 'high': return 'text-green-400'
      case 'medium': return 'text-yellow-400'
      default: return 'text-red-400'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-3">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center justify-center gap-2">
            <span className="text-3xl">🐦</span>
            HummiGuard AI
            <span className="text-3xl">🤖</span>
          </h1>
          <p className="text-purple-300 text-xs">Powered by Claude Vision AI</p>
        </div>

        {/* Alert Banner */}
        {alertActive && (
          <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white p-3 rounded-xl mb-3 flex items-center justify-between shadow-lg shadow-red-500/30">
            <div className="flex items-center gap-2">
              <span className="text-2xl animate-bounce">⚠️</span>
              <div>
                <div className="font-bold">LOW NECTAR ALERT!</div>
                <div className="text-xs opacity-90">Level at {nectarLevel}% — Time to refill!</div>
              </div>
            </div>
            <button
              onClick={() => setAlertMuted(!alertMuted)}
              className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition"
            >
              {alertMuted ? '🔇' : '🔊'}
            </button>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          {/* Video Feed */}
          <div className="md:col-span-2">
            <div className="bg-black/40 backdrop-blur rounded-2xl p-3">
              <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden">
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* AI Analysis Overlay */}
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-purple-900/70 flex items-center justify-center">
                    <div className="text-center text-white">
                      <div className="text-4xl mb-2 animate-pulse">🧠</div>
                      <div className="font-bold">AI Analyzing...</div>
                      <div className="text-xs text-purple-200">Claude is examining the feeder</div>
                    </div>
                  </div>
                )}

                {!isRunning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-purple-900">
                    <div className="text-center text-white p-4">
                      <div className="text-5xl mb-3">📱</div>
                      <div className="font-semibold">Point camera at feeder</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Works on phone or laptop
                      </div>
                    </div>
                  </div>
                )}

                {/* Countdown indicator */}
                {isRunning && countdown > 0 && !isAnalyzing && (
                  <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded-lg text-sm">
                    Next scan: {countdown}s
                  </div>
                )}

                {cameraError && (
                  <div className="absolute bottom-2 left-2 right-2 bg-red-500/90 text-white px-2 py-1 rounded text-xs">
                    {cameraError}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex gap-2 mt-3">
                {!isRunning ? (
                  <button
                    onClick={startCamera}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-2.5 px-4 rounded-xl transition shadow-lg"
                  >
                    ▶️ Start AI Monitoring
                  </button>
                ) : (
                  <>
                    <button
                      onClick={stopCamera}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 px-4 rounded-xl transition"
                    >
                      ⏹️ Stop
                    </button>
                    <button
                      onClick={() => { setCountdown(0) }}
                      disabled={isAnalyzing}
                      className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-500 text-white font-bold py-2.5 px-4 rounded-xl transition"
                    >
                      🔍 Scan Now
                    </button>
                  </>
                )}
              </div>

              {/* Interval Setting */}
              <div className="mt-3 bg-white/5 rounded-xl p-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-purple-200">Check every:</span>
                  <div className="flex gap-1">
                    {[10, 30, 60, 120].map(sec => (
                      <button
                        key={sec}
                        onClick={() => setAnalysisInterval(sec)}
                        className={`px-2 py-1 rounded text-xs transition ${
                          analysisInterval === sec
                            ? 'bg-purple-500 text-white'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                        }`}
                      >
                        {sec < 60 ? `${sec}s` : `${sec/60}m`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Last Analysis Result */}
            {lastAnalysis && (
              <div className="bg-white/10 backdrop-blur rounded-2xl p-3 mt-3">
                <h3 className="text-white font-semibold mb-2 flex items-center gap-2 text-sm">
                  <span>🧠</span> Last AI Analysis
                  <span className="text-xs text-gray-400">({lastAnalysis.timestamp})</span>
                </h3>
                <div className="bg-black/30 rounded-lg p-3 text-sm">
                  <div className="text-purple-200 mb-2">&quot;{lastAnalysis.description}&quot;</div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-gray-400">
                      Confidence: <span className={getConfidenceColor(lastAnalysis.confidence)}>{lastAnalysis.confidence}</span>
                    </span>
                    <span className="text-gray-400">
                      Feeder visible: {lastAnalysis.feeder_visible ? '✅' : '❌'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Status Panel */}
          <div className="space-y-3">
            {/* Level Gauge */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3">
              <h3 className="text-white font-semibold mb-2 text-center text-sm">Nectar Level</h3>
              <div className="relative h-40 bg-gray-800 rounded-xl overflow-hidden border-4 border-gray-600">
                {nectarLevel !== null ? (
                  <>
                    <div
                      className={`absolute bottom-0 left-0 right-0 transition-all duration-1000 ${
                        nectarLevel < threshold
                          ? 'bg-gradient-to-t from-red-600 to-orange-400'
                          : 'bg-gradient-to-t from-pink-600 to-rose-400'
                      }`}
                      style={{ height: `${nectarLevel}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-5xl font-bold text-white drop-shadow-lg">
                        {nectarLevel}%
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <div className="text-3xl mb-1">—</div>
                      <div className="text-xs">Waiting for scan</div>
                    </div>
                  </div>
                )}
                {/* Threshold line */}
                <div
                  className="absolute left-0 right-0 border-t-2 border-dashed border-yellow-400"
                  style={{ bottom: `${threshold}%` }}
                >
                  <span className="absolute -top-4 right-1 text-yellow-400 text-xs font-bold">
                    {threshold}%
                  </span>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className={`rounded-2xl p-3 text-center transition-all ${
              alertActive
                ? 'bg-red-500/30 border-2 border-red-500 shadow-lg shadow-red-500/20'
                : nectarLevel !== null
                  ? 'bg-emerald-500/30 border-2 border-emerald-500'
                  : 'bg-gray-500/30 border-2 border-gray-500'
            }`}>
              <div className="text-3xl mb-1">
                {alertActive ? '🚨' : nectarLevel !== null ? '✅' : '⏳'}
              </div>
              <div className="text-white font-bold text-sm">
                {alertActive ? 'REFILL NEEDED' : nectarLevel !== null ? 'Levels OK' : 'Monitoring...'}
              </div>
            </div>

            {/* Threshold Setting */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3">
              <h3 className="text-white font-semibold mb-2 text-sm">Alert Threshold</h3>
              <input
                type="range"
                min="10"
                max="50"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-yellow-500"
              />
              <div className="text-center text-yellow-300 text-xs">
                Alert when below {threshold}%
              </div>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-2xl p-3">
                <h3 className="text-white font-semibold mb-2 text-sm">📊 Recent Readings</h3>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {history.slice().reverse().slice(0, 5).map((h, i) => (
                    <div key={i} className="flex justify-between text-xs bg-black/20 rounded px-2 py-1">
                      <span className="text-gray-400">{h.time}</span>
                      <span className={h.level < threshold ? 'text-red-400' : 'text-green-400'}>
                        {h.level}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white/5 backdrop-blur rounded-2xl p-3 mt-3">
          <h3 className="text-white font-semibold mb-2 text-sm">🤖 How the AI Works</h3>
          <div className="text-purple-200 text-xs space-y-1">
            <p>1. Camera captures a photo of your hummingbird feeder</p>
            <p>2. Image is sent to Claude AI for visual analysis</p>
            <p>3. AI examines the nectar reservoir and estimates fill level</p>
            <p>4. If below threshold, alarm triggers to remind you to refill</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-4 text-purple-300/60 text-xs">
          HummiGuard AI — Real AI vision for happy hummingbirds 🐦✨
        </div>
      </div>
    </div>
  )
}
