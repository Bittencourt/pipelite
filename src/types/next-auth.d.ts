import type { DefaultSession } from "next-auth"
import type { userRoleEnum } from "@/db/schema/users"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: (typeof userRoleEnum.enumValues)[number]
    } & DefaultSession["user"]
  }
  interface User {
    role: (typeof userRoleEnum.enumValues)[number]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: (typeof userRoleEnum.enumValues)[number]
  }
}
