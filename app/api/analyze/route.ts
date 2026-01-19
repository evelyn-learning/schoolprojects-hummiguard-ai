import { NextRequest, NextResponse } from 'next/server'

interface AnalysisResult {
  level: number
  confidence: 'high' | 'medium' | 'low'
  description: string
  feeder_visible: boolean
}

interface AnthropicContent {
  type: string
  text?: string
}

interface AnthropicResponse {
  content?: AnthropicContent[]
  error?: {
    message: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json()

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: image
                }
              },
              {
                type: 'text',
                text: `You are analyzing an image from a hummingbird feeder monitoring system called HummiGuard.

Your task: Determine the nectar/sugar water fill level in any visible feeder or container.

IMPORTANT: Respond ONLY with a valid JSON object, no other text. Use this exact format:
{
  "level": <number 0-100 representing percentage full>,
  "confidence": "<high|medium|low>",
  "description": "<brief 1-sentence description of what you see>",
  "feeder_visible": <true|false>
}

Guidelines:
- If you see a hummingbird feeder, estimate how full the nectar reservoir is (0-100%)
- If you see any container with liquid that could be being monitored, estimate its fill level
- If no feeder or relevant container is visible, set feeder_visible to false and level to -1
- Consider the liquid line, empty space above it, and overall container capacity
- Red or pink tinted liquid/glass is common for hummingbird feeders

Respond with ONLY the JSON object.`
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Anthropic API error:', errorData)
      return NextResponse.json(
        { error: errorData.error?.message || 'API request failed' },
        { status: response.status }
      )
    }

    const data: AnthropicResponse = await response.json()

    // Extract the text response
    const textContent = data.content?.find((c: AnthropicContent) => c.type === 'text')?.text || ''

    // Parse JSON from response
    let result: AnalysisResult
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseErr) {
      console.error('Parse error:', parseErr, 'Response:', textContent)
      result = {
        level: -1,
        confidence: 'low',
        description: 'Could not parse AI response',
        feeder_visible: false
      }
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
