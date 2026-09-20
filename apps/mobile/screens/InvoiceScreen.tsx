import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { opsRequest } from "../lib/api";
import {
  isValidMobile,
  mobileDigits,
  parseAmount,
  sanitizeAmountInput,
  sanitizeMobileInput,
} from "../lib/opsHelpers";
import type { Arena, CartItem } from "../lib/types";
import {
  BackHeader,
  Card,
  Chip,
  DeleteIconButton,
  ErrorText,
  Field,
  Label,
  Muted,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionCard,
} from "../components/ui";
import { useTheme } from "../lib/theme";

function formatCustomerPhone(mobile: string) {
  const digits = mobileDigits(mobile);
  if (digits.length === 10) return `+91 ${digits}`;
  return digits || "—";
}

function whatsAppPhone(mobile: string) {
  const digits = mobileDigits(mobile);
  if (digits.length === 10) return `91${digits}`;
  if (digits.length > 10) return digits;
  return "";
}

function parseYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseHm(value: string) {
  const [h = "0", m = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return date;
}

function toHm(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { colors: themeColors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.pickerBtn,
          { backgroundColor: themeColors.inputBg, borderColor: themeColors.border },
        ]}
      >
        <Text style={{ color: themeColors.text, fontWeight: "700" }}>{value || "Select date"}</Text>
        <Text style={{ color: themeColors.faint, fontSize: 12 }}>Calendar</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={parseYmd(value)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selected) => {
            if (Platform.OS === "android") setOpen(false);
            if (event.type === "dismissed") {
              setOpen(false);
              return;
            }
            if (selected) onChange(toYmd(selected));
          }}
        />
      ) : null}
      {Platform.OS === "ios" && open ? (
        <Pressable onPress={() => setOpen(false)} style={{ alignSelf: "flex-end" }}>
          <Text style={{ color: themeColors.greenDeep, fontWeight: "800" }}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { colors: themeColors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.pickerBtn,
          { backgroundColor: themeColors.inputBg, borderColor: themeColors.border },
        ]}
      >
        <Text style={{ color: themeColors.text, fontWeight: "700" }}>{value || "Select time"}</Text>
        <Text style={{ color: themeColors.faint, fontSize: 12 }}>Clock</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={parseHm(value)}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selected) => {
            if (Platform.OS === "android") setOpen(false);
            if (event.type === "dismissed") {
              setOpen(false);
              return;
            }
            if (selected) onChange(toHm(selected));
          }}
        />
      ) : null}
      {Platform.OS === "ios" && open ? (
        <Pressable onPress={() => setOpen(false)} style={{ alignSelf: "flex-end" }}>
          <Text style={{ color: themeColors.greenDeep, fontWeight: "800" }}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type InvoiceDraft = {
  arenaName: string;
  arenaAddress?: string | null;
  arenaPincode?: string | null;
  arenaPhone?: string | null;
  billNumber: number;
  customerName: string;
  customerMobile: string;
  sportName?: string;
  courtNames: string[];
  bookingDate: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  bookingAmount: number;
  items: CartItem[];
  discount: number;
  advance: number;
  subTotal: number;
  grandTotal: number;
  paymentMode: string;
  bookingMethod: string;
};

type SavedInvoice = {
  id: string;
  bill_number: number;
  customer_name: string;
  customer_mobile: string;
  grand_total: number;
  payload: InvoiceDraft;
  created_at: string;
};

let cachedLogoDataUri: string | null = null;

async function getSportzArenaLogoDataUri() {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const asset = Asset.fromModule(require("../assets/sportzarena-logo.png"));
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) return "";
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    cachedLogoDataUri = `data:image/png;base64,${base64}`;
    return cachedLogoDataUri;
  } catch {
    return "";
  }
}

function draftToText(draft: InvoiceDraft) {
  const customerPhone = formatCustomerPhone(draft.customerMobile);
  return [
    "SportzArena",
    draft.arenaName,
    [draft.arenaAddress, draft.arenaPincode].filter(Boolean).join(", "),
    draft.arenaPhone ? `Arena Ph: ${formatCustomerPhone(draft.arenaPhone)}` : "",
    (draft.startDate || draft.endDate) ? `Period: ${draft.startDate || "—"} → ${draft.endDate || "—"}` : "",
    `Bill #${draft.billNumber}`,
    `Customer: ${draft.customerName}`,
    `Mobile: ${customerPhone}`,
    draft.sportName ? `Sport: ${draft.sportName}` : "",
    draft.courtNames.length ? `Courts: ${draft.courtNames.join(", ")}` : "",
    `Date: ${draft.bookingDate} ${draft.startTime}-${draft.endTime}`,
    `Booking: ₹${draft.bookingAmount.toFixed(0)}`,
    ...draft.items.map((i) => `${i.name} × ${i.quantity} = ₹${(i.price * i.quantity).toFixed(0)}`),
    draft.discount ? `Discount: ₹${draft.discount.toFixed(0)}` : "",
    draft.advance ? `Advance: ₹${draft.advance.toFixed(0)}` : "",
    `Total: ₹${draft.grandTotal.toFixed(0)} (${draft.paymentMode})`,
    "Powered by SportzArena",
  ].filter(Boolean).join("\n");
}

function draftToHtml(draft: InvoiceDraft, logoDataUri: string) {
  const address = [draft.arenaAddress, draft.arenaPincode].filter(Boolean).join(", ");
  const lines = draft.items.map((i) => (
    `<tr><td>${escapeHtml(i.name)}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">₹${(i.price * i.quantity).toFixed(0)}</td></tr>`
  )).join("");
  const logoBlock = logoDataUri
    ? `<img src="${logoDataUri}" alt="SportzArena" style="display:block;margin:0 auto 10px;height:64px;width:auto;max-width:180px;background:#fff;border-radius:12px;padding:6px 10px;" />`
    : `<p style="text-align:center;font-weight:800;font-size:18px;margin:0 0 8px;color:#0B2D58">Sportz<span style="color:#00D084">Arena</span></p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0c2138;padding:24px;max-width:480px;margin:0 auto}
    h1{font-size:20px;margin:0 0 4px;text-align:center;text-transform:uppercase}.muted{color:#5b6b7e;font-size:12px;margin:0;text-align:center}
    .bill{margin:16px 0;font-size:13px;font-weight:700;color:#2a8f0a;text-align:center}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
    td,th{padding:8px 0;border-bottom:1px solid #e4ebf3}
    .total{font-size:20px;font-weight:800;margin-top:12px}
    .box{background:#f4f7fb;border-radius:12px;padding:14px;margin-top:12px}
    .powered{margin-top:20px;text-align:center;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.04em}
    .powered span{color:#00D084}
  </style></head><body>
  ${logoBlock}
  <h1>${escapeHtml(draft.arenaName)}</h1>
  <p class="muted">Payment Receipt</p>
  <p class="muted">${escapeHtml(address || "")}</p>
  ${draft.arenaPhone ? `<p class="muted">Arena Ph: ${escapeHtml(formatCustomerPhone(draft.arenaPhone))}</p>` : ""}
  <p class="bill">Bill #${draft.billNumber}</p>
  <div class="box">
    <p><strong>${escapeHtml(draft.customerName)}</strong></p>
    <p><strong>Mobile:</strong> ${escapeHtml(formatCustomerPhone(draft.customerMobile))}</p>
    ${draft.sportName ? `<p class="muted" style="text-align:left">Sport: ${escapeHtml(draft.sportName)}</p>` : ""}
    ${draft.courtNames.length ? `<p class="muted" style="text-align:left">Courts: ${escapeHtml(draft.courtNames.join(", "))}</p>` : ""}
    <p class="muted" style="text-align:left">${escapeHtml(draft.bookingDate)} · ${escapeHtml(draft.startTime)}-${escapeHtml(draft.endTime)}</p>
  </div>
  <table>
    <tr><th align="left">Item</th><th>Qty</th><th align="right">Amount</th></tr>
    ${draft.bookingAmount ? `<tr><td>Booking</td><td style="text-align:center">1</td><td style="text-align:right">₹${draft.bookingAmount.toFixed(0)}</td></tr>` : ""}
    ${lines}
    ${draft.discount ? `<tr><td colspan="2">Discount</td><td style="text-align:right">−₹${draft.discount.toFixed(0)}</td></tr>` : ""}
    ${draft.advance ? `<tr><td colspan="2">Advance</td><td style="text-align:right">−₹${draft.advance.toFixed(0)}</td></tr>` : ""}
  </table>
  <p class="total">Total ₹${draft.grandTotal.toFixed(0)}</p>
  <p class="muted" style="text-align:left">Paid via ${escapeHtml(draft.paymentMode)}</p>
  <p class="powered">Powered by Sportz<span>Arena</span></p>
  </body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureFileUri(uri: string) {
  if (!uri) return uri;
  if (uri.startsWith("file://") || uri.startsWith("content://") || uri.startsWith("data:")) return uri;
  return `file://${uri}`;
}

async function shareInvoicePdf(draft: InvoiceDraft) {
  const logoDataUri = await getSportzArenaLogoDataUri();
  const html = draftToHtml(draft, logoDataUri);

  // Web / unsupported: open native print dialog or share text instead of a local file URI.
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }

  const printed = await Print.printToFileAsync({ html, base64: true });
  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) {
    // Last resort: try sharing the print temp URI directly.
    const direct = ensureFileUri(printed.uri);
    if (!(await Sharing.isAvailableAsync())) {
      await Share.share({ message: draftToText(draft), url: direct });
      return;
    }
    await Sharing.shareAsync(direct, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: `Invoice #${draft.billNumber}`,
    });
    return;
  }

  const fileName = `sportzarena-invoice-${draft.billNumber}-${Date.now()}.pdf`;
  const destUri = `${baseDir}${fileName}`;

  // Writing into the app sandbox avoids "Not allowed to read file under given URL"
  // when Sharing cannot open Print's temporary location.
  if (printed.base64) {
    await FileSystem.writeAsStringAsync(destUri, printed.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else if (printed.uri) {
    await FileSystem.copyAsync({ from: ensureFileUri(printed.uri), to: destUri });
  } else {
    throw new Error("Could not create PDF file");
  }

  const info = await FileSystem.getInfoAsync(destUri);
  if (!info.exists) {
    throw new Error("PDF was created but is not readable on this device");
  }

  const shareUri = ensureFileUri(destUri);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: `Invoice #${draft.billNumber}`,
    });
    return;
  }

  await Share.share({
    title: `Invoice #${draft.billNumber}`,
    message: draftToText(draft),
    url: shareUri,
  });
}

async function shareInvoiceWhatsApp(draft: InvoiceDraft) {
  const phone = whatsAppPhone(draft.customerMobile);
  if (!phone) {
    throw new Error("Enter a valid 10-digit customer mobile to share on WhatsApp");
  }
  const text = draftToText(draft);
  const appUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`;
  const webUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  try {
    const canOpen = await Linking.canOpenURL(appUrl);
    await Linking.openURL(canOpen ? appUrl : webUrl);
  } catch {
    await Linking.openURL(webUrl);
  }
}

export function InvoiceScreen({
  session,
  arena,
  onBack,
}: {
  session: Session;
  arena: Arena;
  onBack: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [sportName, setSportName] = useState("");
  const [courtNames, setCourtNames] = useState("");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [bookingAmount, setBookingAmount] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [advance, setAdvance] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [billNumber, setBillNumber] = useState("");
  const [preview, setPreview] = useState<InvoiceDraft | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedInvoice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  async function loadHistory() {
    const data = await opsRequest<{ invoices: SavedInvoice[] }>(session, arena.id, "/ops/generated-invoices");
    const list = data.invoices.map((row) => ({
      ...row,
      payload: row.payload as InvoiceDraft,
    }));
    setHistory(list);
    const maxBill = list.reduce((max, row) => Math.max(max, Number(row.bill_number || 0)), 0);
    const next = String(maxBill + 1);
    setBillNumber((current) => {
      const n = Number(current);
      if (!current || !Number.isFinite(n) || n <= 0 || n <= maxBill) return next;
      return current;
    });
  }

  useEffect(() => {
    loadHistory().catch(() => undefined);
  }, [session.access_token, arena.id]);

  function pendingLine(): CartItem | null {
    const price = parseAmount(itemPrice);
    const qty = Number(itemQty);
    if (!itemName.trim() || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty < 1) return null;
    return { itemId: null, name: itemName.trim(), price, quantity: qty, category: "EQUIPMENT" };
  }

  async function buildPreview() {
    setError("");
    if (!customerName.trim()) return setError("Customer name is required");
    if (!isValidMobile(customerMobile, true)) return setError("Enter a valid 10-digit mobile number");
    if (!startDate.trim() || !endDate.trim()) return setError("Start date and end date are required");
    if (endDate < startDate) return setError("End date must be on or after start date");
    const pending = pendingLine();
    const allItems = pending ? [...items, pending] : items;
    if (pending) {
      setItems(allItems);
      setItemName("");
      setItemPrice("");
      setItemQty("1");
    }
    const booking = Number(bookingAmount || 0);
    const itemsTotal = allItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const disc = Number(discount || 0);
    const adv = Number(advance || 0);
    const subTotal = booking + itemsTotal;
    const grand = Math.max(0, subTotal - disc - adv);
    if (grand <= 0 && subTotal <= 0) return setError("Enter booking amount or add line items");

    const nextBill = Number(billNumber)
      || (history.reduce((max, row) => Math.max(max, Number(row.bill_number || 0)), 0) + 1);
    const draft: InvoiceDraft = {
      arenaName: arena.name,
      arenaAddress: arena.address,
      arenaPincode: arena.pincode,
      arenaPhone: arena.contactPhone,
      billNumber: nextBill,
      customerName: customerName.trim(),
      customerMobile: mobileDigits(customerMobile),
      sportName: sportName.trim() || undefined,
      courtNames: courtNames ? courtNames.split(",").map((s) => s.trim()).filter(Boolean) : [],
      bookingDate,
      startDate,
      endDate,
      startTime,
      endTime,
      bookingAmount: booking,
      items: allItems,
      discount: disc,
      advance: adv,
      subTotal,
      grandTotal: grand,
      paymentMode,
      bookingMethod: "WALK_IN",
    };

    setBusy(true);
    try {
      const saved = await opsRequest<{ invoice: { id: string } }>(session, arena.id, "/ops/generated-invoices", {
        method: "POST",
        body: JSON.stringify({
          billNumber: draft.billNumber,
          customerName: draft.customerName,
          customerMobile: draft.customerMobile,
          grandTotal: draft.grandTotal,
          payload: draft,
        }),
      });
      setSavedId(saved.invoice.id);
      setPreview(draft);
      setBillNumber(String(nextBill + 1));
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save invoice");
    } finally {
      setBusy(false);
    }
  }

  function removeSaved(id: string) {
    Alert.alert("Remove?", "Remove this saved invoice?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          opsRequest(session, arena.id, `/ops/generated-invoices/${id}`, { method: "DELETE" })
            .then(async () => {
              if (savedId === id) {
                setPreview(null);
                setSavedId(null);
              }
              await loadHistory();
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Remove failed"));
        },
      },
    ]);
  }

  async function onSharePdf(draft: InvoiceDraft) {
    setShareBusy(true);
    setError("");
    try {
      await shareInvoicePdf(draft);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Share failed";
      if (!/cancel/i.test(message)) {
        setError(message);
        Alert.alert("Share PDF", message);
      }
    } finally {
      setShareBusy(false);
    }
  }

  async function onShareWhatsApp(draft: InvoiceDraft) {
    setShareBusy(true);
    setError("");
    try {
      await shareInvoiceWhatsApp(draft);
    } catch (err) {
      const message = err instanceof Error ? err.message : "WhatsApp share failed";
      setError(message);
      Alert.alert("WhatsApp", message);
    } finally {
      setShareBusy(false);
    }
  }

  if (preview) {
    const text = draftToText(preview);
    return (
      <Screen>
        <BackHeader title="Invoice preview" onBack={() => { setPreview(null); setSavedId(null); setError(""); }} />
        <Card style={styles.receipt}>
          <Image
            source={require("../assets/sportzarena-logo.png")}
            style={styles.receiptLogo}
            resizeMode="contain"
          />
          <Text style={[styles.receiptBrand, { color: themeColors.navyDeep }]}>
            Sportz<Text style={{ color: themeColors.green }}>Arena</Text>
          </Text>
          <Text style={[styles.receiptArena, { color: themeColors.text }]}>{preview.arenaName}</Text>
          <Muted>Payment Receipt</Muted>
          <Muted>{[preview.arenaAddress, preview.arenaPincode].filter(Boolean).join(", ") || " "}</Muted>
          {preview.arenaPhone ? <Muted>Arena Ph: {formatCustomerPhone(preview.arenaPhone)}</Muted> : null}
          <Text style={[styles.receiptBill, { color: themeColors.greenDeep }]}>Bill #{preview.billNumber}</Text>
          <View style={[styles.receiptBox, { backgroundColor: themeColors.soft }]}>
            <Text style={[styles.receiptStrong, { color: themeColors.text }]}>{preview.customerName}</Text>
            <Text style={[styles.receiptStrong, { color: themeColors.text }]}>
              Mobile: {formatCustomerPhone(preview.customerMobile)}
            </Text>
            {preview.sportName ? <Muted>Sport: {preview.sportName}</Muted> : null}
            {preview.courtNames.length ? <Muted>Courts: {preview.courtNames.join(", ")}</Muted> : null}
            <Muted>{preview.bookingDate} · {preview.startTime}-{preview.endTime}</Muted>
          </View>
          {preview.bookingAmount > 0 ? (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, { color: themeColors.text }]}>Booking</Text>
              <Text style={[styles.lineAmt, { color: themeColors.text }]}>₹{preview.bookingAmount.toFixed(0)}</Text>
            </View>
          ) : null}
          {preview.items.map((item, idx) => (
            <View key={`${item.name}-${idx}`} style={styles.lineRow}>
              <Text style={[styles.lineLabel, { color: themeColors.text }]}>{item.name} × {item.quantity}</Text>
              <Text style={[styles.lineAmt, { color: themeColors.text }]}>₹{(item.price * item.quantity).toFixed(0)}</Text>
            </View>
          ))}
          {preview.discount > 0 ? (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, { color: themeColors.text }]}>Discount</Text>
              <Text style={[styles.lineAmt, { color: themeColors.text }]}>−₹{preview.discount.toFixed(0)}</Text>
            </View>
          ) : null}
          {preview.advance > 0 ? (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, { color: themeColors.text }]}>Advance</Text>
              <Text style={[styles.lineAmt, { color: themeColors.text }]}>−₹{preview.advance.toFixed(0)}</Text>
            </View>
          ) : null}
          <Text style={[styles.receiptTotal, { color: themeColors.text }]}>Total ₹{preview.grandTotal.toFixed(0)}</Text>
          <Muted>Paid via {preview.paymentMode}</Muted>
          <Text style={[styles.powered, { color: themeColors.faint }]}>
            Powered by Sportz<Text style={{ color: themeColors.green }}>Arena</Text>
          </Text>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton
            label={shareBusy ? "Preparing…" : "Share PDF"}
            busy={shareBusy}
            onPress={() => { void onSharePdf(preview); }}
          />
          <SecondaryButton
            label={`WhatsApp to ${formatCustomerPhone(preview.customerMobile)}`}
            onPress={() => { void onShareWhatsApp(preview); }}
          />
          <SecondaryButton label="Share as text" onPress={() => Share.share({ message: text })} />
          {savedId && (
            <DeleteIconButton label="Delete saved" onPress={() => removeSaved(savedId)} />
          )}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackHeader title="Generate Invoice" onBack={onBack} />
      <Muted>Same flow as web — fill details, save, then share a PDF receipt with the SportzArena logo.</Muted>

      <SectionCard step={1} title="Customer & booking">
        <Label>Bill #</Label>
        <Field
          keyboardType="number-pad"
          value={billNumber}
          onChangeText={setBillNumber}
          placeholder="Next bill #"
        />
        <Label>Customer</Label>
        <Field
          value={customerName}
          onChangeText={setCustomerName}
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
        />
        <Label>Mobile</Label>
        <Field
          keyboardType="number-pad"
          maxLength={10}
          value={customerMobile}
          onChangeText={(v) => setCustomerMobile(sanitizeMobileInput(v))}
          placeholder="10-digit mobile"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <Label>Sport</Label>
        <Field
          value={sportName}
          onChangeText={setSportName}
          placeholder="Optional"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
        />
        <Label>Courts</Label>
        <Field
          value={courtNames}
          onChangeText={setCourtNames}
          placeholder="Court 1, Court 2"
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
        />
        <DateField label="Start date" value={startDate} onChange={setStartDate} />
        <DateField label="End date" value={endDate} onChange={setEndDate} />
        <DateField label="Session date" value={bookingDate} onChange={setBookingDate} />
        <TimeField label="Start time" value={startTime} onChange={setStartTime} />
        <TimeField label="End time" value={endTime} onChange={setEndTime} />
        <Label>Booking amount</Label>
        <Field
          keyboardType="decimal-pad"
          value={bookingAmount}
          onChangeText={(v) => setBookingAmount(sanitizeAmountInput(v))}
        />
      </SectionCard>

      <SectionCard step={2} title="Line items & payment">
        <Label>Add item name</Label>
        <Field value={itemName} onChangeText={setItemName} />
        <Label>Item price</Label>
        <Field keyboardType="decimal-pad" value={itemPrice} onChangeText={(v) => setItemPrice(sanitizeAmountInput(v))} />
        <Label>Qty</Label>
        <Field keyboardType="number-pad" value={itemQty} onChangeText={setItemQty} />
        <PrimaryButton
          label="Add line item"
          onPress={() => {
            const line = pendingLine();
            if (!line) {
              setError("Enter item name, price and quantity");
              return;
            }
            setError("");
            setItems((c) => [...c, line]);
            setItemName("");
            setItemPrice("");
            setItemQty("1");
          }}
        />
        {items.map((item, idx) => (
          <Muted key={`${item.name}-${idx}`}>{item.name} × {item.quantity} · ₹{(item.price * item.quantity).toFixed(0)}</Muted>
        ))}
        <Label>Discount</Label>
        <Field keyboardType="decimal-pad" value={discount} onChangeText={(v) => setDiscount(sanitizeAmountInput(v))} />
        <Label>Advance</Label>
        <Field keyboardType="decimal-pad" value={advance} onChangeText={(v) => setAdvance(sanitizeAmountInput(v))} />
        <Label>Payment</Label>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["CASH", "ONLINE"].map((m) => (
            <Chip key={m} label={m} active={paymentMode === m} onPress={() => setPaymentMode(m)} />
          ))}
        </View>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton
          label={busy ? "Saving…" : "Save & preview invoice"}
          onPress={() => { if (!busy) void buildPreview(); }}
        />
      </SectionCard>

      <SectionCard title="Saved invoices">
        {history.length === 0 && <Muted>No saved invoices yet.</Muted>}
        {history.map((row) => (
          <View key={row.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
            <Text style={{ color: themeColors.navy, fontWeight: "700" }}>
              #{row.bill_number} · {row.customer_name}
            </Text>
            <Muted>₹{Number(row.grand_total).toFixed(0)} · {formatCustomerPhone(row.customer_mobile || row.payload?.customerMobile || "")} · {new Date(row.created_at).toLocaleString("en-IN")}</Muted>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
              <Pressable onPress={() => { setSavedId(row.id); setPreview(row.payload); setError(""); }}>
                <Text style={{ color: themeColors.navy, fontWeight: "700" }}>Preview</Text>
              </Pressable>
              <DeleteIconButton onPress={() => removeSaved(row.id)} />
            </View>
          </View>
        ))}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pickerBtn: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  receipt: { gap: 8, alignItems: "stretch" },
  receiptLogo: {
    width: 72,
    height: 72,
    alignSelf: "center",
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  receiptBrand: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  receiptArena: { fontSize: 20, fontWeight: "800", textAlign: "center", textTransform: "uppercase" },
  receiptBill: { marginTop: 8, fontSize: 13, fontWeight: "700", textAlign: "center" },
  receiptBox: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  receiptStrong: { fontWeight: "700" },
  lineRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  lineLabel: { flex: 1, fontSize: 14 },
  lineAmt: { fontWeight: "700" },
  receiptTotal: { marginTop: 8, fontSize: 22, fontWeight: "800" },
  powered: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 4,
  },
});
