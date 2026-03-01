import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { parse } from "yaml"

/**
 * GET /api/v1/docs - OpenAPI specification
 * 
 * Serves the OpenAPI 3.1 specification as JSON.
 * This endpoint is public (no authentication required) to enable
 * external tools to discover and integrate with the API.
 */
export async function GET() {
  try {
    const specPath = join(process.cwd(), "public", "openapi.yaml")
    const yamlContent = await readFile(specPath, "utf-8")
    const openapiSpec = parse(yamlContent)

    return NextResponse.json(openapiSpec, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    })
  } catch (error) {
    console.error("Failed to load OpenAPI spec:", error)
    return NextResponse.json(
      { error: "OpenAPI specification not available" },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS /api/v1/docs - CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  })
}
