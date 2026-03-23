import type { UserRole, UserStatus, MembershipRole, UpdateStatus } from "@prisma/client";

// Extend NextAuth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      roles: UserRole[];
      status: UserStatus;
    };
  }

  interface User {
    roles: UserRole[];
    status: UserStatus;
  }
}


// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Dashboard types
export interface CompanySummary {
  id: string;
  name: string;
  logo: string | null;
  sector: string | null;
  geography: string | null;
  lastUpdateDate: Date | null;
  updateCount: number;
  daysSinceUpdate: number | null;
}

export interface MetricTrend {
  metricName: string;
  unit: string | null;
  values: { date: string; value: number }[];
}

export { UserRole, UserStatus, MembershipRole, UpdateStatus };
