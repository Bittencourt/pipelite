import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session

  // Protected routes
  const protectedPaths = ["/settings", "/admin"]
  const isProtectedPath = protectedPaths.some((path) =>
    nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin-only routes
  const adminPaths = ["/admin"]
  const isAdminPath = adminPaths.some((path) =>
    nextUrl.pathname.startsWith(path)
  )

  if (isAdminPath && session?.user?.role !== "admin") {
    return NextResponse.redirect(
      new URL("/?error=unauthorized", nextUrl.origin)
    )
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
