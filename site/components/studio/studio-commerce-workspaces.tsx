"use client";

import { useCallback, useState } from "react";
import type { OrderRecord, ReviewRecord } from "@/lib/db";
import { createInvoiceAction, createShippingLabelAction } from "@/lib/actions";
import { formatDateTime, formatMoney } from "@/lib/format";
import { StudioOrderEditor, StudioReviewEditor } from "@/components/studio/studio-commerce-editors";
import { StudioRecordList } from "@/components/studio/studio-record-list";
import { flushStudioNavigationQueues } from "@/components/studio/studio-navigation-state";

export function StudioOrdersWorkspace({ orders: initialOrders, initialReference = "" }: { orders: OrderRecord[]; initialReference?: string }) {
  const [orders, setOrders] = useState(initialOrders);
  const [serverOrders, setServerOrders] = useState(initialOrders);
  const [operationError, setOperationError] = useState("");
  // Server actions refresh this collection without remounting the workspace.
  // Keep the list's search/page state while adopting deletions and new versions.
  if (serverOrders !== initialOrders) {
    setServerOrders(initialOrders);
    setOrders(initialOrders);
  }
  const [reference, setReference] = useState(initialReference || orders[0]?.orderNumber || "");
  const selected = orders.find((order) => order.orderNumber === reference) ?? orders[0];
  const onSaved = useCallback((next: OrderRecord) => setOrders((current) => current.map((order) => order.orderNumber === next.orderNumber ? next : order)), []);
  async function runOperation(data: FormData, action: (data: FormData) => Promise<void>) {
    setOperationError("");
    try {
      await flushStudioNavigationQueues();
    } catch {
      setOperationError("Finish saving or resolve the current edit before issuing an invoice or shipping label.");
      return;
    }
    await action(data);
  }
  return <div className="studio-master-detail" data-audit-id="studio-orders-workspace">
    <StudioRecordList label="Orders" records={orders.map((order) => ({ key: order.orderNumber, label: order.orderNumber, meta: `${order.status} - ${formatMoney(order.totalCents)}`, search: `${order.userEmail ?? ""} ${order.projectReference ?? ""} ${order.trackingNumber ?? ""}` }))} selectedKey={selected?.orderNumber ?? ""} onSelect={setReference} />
    <div data-studio-record-detail>
      {selected ? <article className="studio-panel studio-editor-card" key={selected.orderNumber}>
        <div className="studio-editor-head"><h3>{selected.orderNumber}</h3><span>{formatMoney(selected.totalCents)}</span></div>
        <StudioOrderEditor order={selected} onSaved={onSaved} />
        <div className="button-row">
          <form action={(data) => runOperation(data, createInvoiceAction)}><input name="orderNumber" type="hidden" value={selected.orderNumber} /><button className="button-secondary" type="submit">Issue invoice</button></form>
          <form action={(data) => runOperation(data, createShippingLabelAction)}><input name="orderNumber" type="hidden" value={selected.orderNumber} /><input name="weightOunces" type="hidden" value="96" /><button className="button-secondary" type="submit">Create label</button></form>
        </div>
        {operationError ? <p className="notice-panel danger" role="alert">{operationError}</p> : null}
        <p className="muted-copy">Updated {formatDateTime(selected.updatedAt)}</p>
      </article> : <p className="notice-panel">No orders yet.</p>}
    </div>
  </div>;
}

export function StudioReviewsWorkspace({ reviews: initialReviews, initialPiece = "" }: { reviews: ReviewRecord[]; initialPiece?: string }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [serverReviews, setServerReviews] = useState(initialReviews);
  if (serverReviews !== initialReviews) {
    setServerReviews(initialReviews);
    setReviews(initialReviews);
  }
  const [id, setId] = useState(reviews.find((review) => review.pieceSlug === initialPiece)?.id ?? reviews[0]?.id ?? "");
  const selected = reviews.find((review) => review.id === id) ?? reviews[0];
  const onSaved = useCallback((next: ReviewRecord) => setReviews((current) => current.map((review) => review.id === next.id ? next : review)), []);
  return <div className="studio-master-detail" data-audit-id="studio-reviews-workspace">
    <StudioRecordList label="Reviews" records={reviews.map((review) => ({ key: review.id, label: review.title, meta: `${review.status} - ${review.rating}/5 - ${review.reviewerName}`, search: review.pieceSlug }))} selectedKey={selected?.id ?? ""} onSelect={setId} />
    <div data-studio-record-detail>
      {selected ? <StudioReviewEditor key={selected.id} review={selected} onSaved={onSaved} /> : <p className="notice-panel">No reviews yet.</p>}
    </div>
  </div>;
}
