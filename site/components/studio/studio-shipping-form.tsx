"use client";
import {
  workerShippingRatesAction,
  workerShippingLabelAction,
} from "@/lib/woodworker-actions";
import { useState } from "react";
import {
  createShippingLabelAction,
  requestShippingRatesAction,
} from "@/lib/actions";
import { flushStudioNavigationQueues } from "@/components/studio/studio-navigation-state";
import type { OrderShippingQuote } from "@/lib/commerce";
export function StudioShippingForm({
  orderNumber,
  worker = false,
}: {
  orderNumber: string;
  worker?: boolean;
}) {
  const [quote, setQuote] = useState<OrderShippingQuote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [labelUrl, setLabelUrl] = useState("");
  async function rates(data: FormData) {
    setBusy(true);
    setError("");
    setDone(false);
    setQuote(null);
    try {
      if (!worker) await flushStudioNavigationQueues();
      setQuote(
        await (worker ? workerShippingRatesAction : requestShippingRatesAction)(
          orderNumber,
          {
            weightOunces: Number(data.get("weight")),
            lengthInches: Number(data.get("length")),
            widthInches: Number(data.get("width")),
            heightInches: Number(data.get("height")),
          },
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to request shipping rates.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function buy(data: FormData) {
    setBusy(true);
    setError("");
    try {
      if (!worker) await flushStudioNavigationQueues();
      const result = await (
        worker ? workerShippingLabelAction : createShippingLabelAction
      )(data);
      setLabelUrl(result.labelUrl);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Label purchase was not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Shipping quote and label" className="studio-panel">
      <h4>Shipping quote</h4>
      <p className="muted-copy">
        Confirm the saved destination and enter the packed dimensions.
        Requesting rates does not buy postage.
      </p>
      <form action={rates} className="request-form compact-form">
        <div className="field-grid">
          <label>
            <span>Packed weight (oz)</span>
            <input min="0.1" name="weight" required step="0.1" type="number" />
          </label>
          <label>
            <span>Length (in)</span>
            <input min="0.1" name="length" required step="0.1" type="number" />
          </label>
          <label>
            <span>Width (in)</span>
            <input min="0.1" name="width" required step="0.1" type="number" />
          </label>
          <label>
            <span>Height (in)</span>
            <input min="0.1" name="height" required step="0.1" type="number" />
          </label>
        </div>
        <button className="button-secondary" disabled={busy} type="submit">
          Get shipping rates
        </button>
      </form>
      {quote && !done ? (
        <form action={buy} className="request-form compact-form">
          <input name="orderNumber" type="hidden" value={orderNumber} />
          <input name="operationKey" type="hidden" value={quote.operationKey} />
          <input name="shipmentId" type="hidden" value={quote.shipmentId} />
          <label>
            <span>Carrier and service</span>
            <select name="rateId" required>
              {quote.rates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.carrier} · {rate.service} · {rate.amount}{" "}
                  {rate.currency.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input name="confirmPurchase" required type="checkbox" value="1" />
            <span>
              Buy the selected postage using the configured EasyPost account.
            </span>
          </label>
          <button className="button-primary" disabled={busy} type="submit">
            Purchase selected label
          </button>
        </form>
      ) : null}
      {done ? (
        <p role="status">
          Label purchased. The order is awaiting carrier handoff; buying postage
          does not mark it shipped.{" "}
          <a href={labelUrl} target="_blank" rel="noreferrer">
            Open shipping label
          </a>
        </p>
      ) : null}
      {busy ? <p role="status">Waiting for the provider…</p> : null}
      {error ? (
        <p className="notice-panel danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
