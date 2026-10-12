import { AnimatedStatus } from '@/components/TypographyMotion'
import { type VariantProps } from "class-variance-authority";
import * as React from "react";
import { badgeVariants } from "./badge-variants";

import { cn } from "@/lib/utils";



export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props}>{typeof children === 'string' && /^(Trống|Đang phục vụ|Chờ xác nhận|Chờ dọn|Chờ nấu|Đang nấu(?:\.\.\.)?|Hoàn thành|Đã thanh toán|Đã TT|Online|Offline)$/.test(children.trim()) ? <AnimatedStatus>{children}</AnimatedStatus> : children}</div>;
}

export { Badge };
