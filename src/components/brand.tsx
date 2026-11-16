import Image from "next/image";
import { brandMark, brandName } from "@/lib/brand";

export function Brand() {
  return <span className="brand">
    <Image className="brand-mark" src={brandMark} alt="" width={36} height={36} unoptimized />
    <span className="brand-name">{brandName}</span>
  </span>;
}
