import Link from "next/link";
import { inquiryContextUrl, INQUIRY_INTENT_LABELS, pieceInquiryIntents, type InquiryPiece } from "@/lib/website-inquiry";

export function PieceInquiryLinks({ piece, sourceRoute }: { piece: InquiryPiece; sourceRoute: string }) {
  return <div className="share-links" role="group" aria-label={`Inquire about ${piece.title}`}>
    {pieceInquiryIntents(piece).map(intent => <Link key={intent} href={inquiryContextUrl(piece, intent, sourceRoute)}>{INQUIRY_INTENT_LABELS[intent]}</Link>)}
  </div>;
}
