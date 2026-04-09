import { useEffect, useMemo, useRef, useState } from 'react'

import { API_BASE_URL } from './config.js'

const TAX_RATE = 0.0925
/** Synthetic id — never stored in cart state; only used for display rows */
const PROMO_FREE_FRIES_ID = 'promo-free-classic-fries'

function money(value) {
  return Number(value).toFixed(2)
}

/** Max digits stored as cents (e.g. "2500" = $25.00) */
const MAX_CUSTOM_TIP_CENTS_DIGITS = 12

function centsDigitsToDollars(digits) {
  if (!digits || digits === '') return 0
  const cents = parseInt(digits, 10)
  if (Number.isNaN(cents) || cents < 0) return 0
  return cents / 100
}

/** Display "0.05", "2.00" — no $ in the field */
function formatCustomTipDisplay(digits) {
  if (!digits || digits === '') return ''
  return centsDigitsToDollars(digits).toFixed(2)
}

function formatCardNumberInput(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 16)
  const parts = []
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4))
  }
  return parts.join(' ')
}

function cardNumberDigitsOnly(formatted) {
  return formatted.replace(/\D/g, '')
}

function formatExpiryInput(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

/** Returns { ok: boolean, message: string } — message is empty when ok or not yet showable */
function validateExpiryDate(mmyyDisplay) {
  const digits = mmyyDisplay.replace(/\D/g, '')
  if (digits.length === 0) {
    return { ok: false, message: '' }
  }
  if (digits.length < 4) {
    return { ok: false, message: 'Use format MM/YY (4 digits).' }
  }
  const mm = parseInt(digits.slice(0, 2), 10)
  const yy = parseInt(digits.slice(2, 4), 10)
  if (Number.isNaN(mm) || Number.isNaN(yy)) {
    return { ok: false, message: 'Enter a valid expiry date (MM/YY).' }
  }
  if (mm < 1 || mm > 12) {
    return { ok: false, message: 'Month must be between 01 and 12.' }
  }
  const fullYear = 2000 + yy
  const now = new Date()
  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1
  if (fullYear < curYear || (fullYear === curYear && mm < curMonth)) {
    return { ok: false, message: 'This card has expired.' }
  }
  return { ok: true, message: '' }
}

function getCardNumberErrorMessage(formatted) {
  const d = cardNumberDigitsOnly(formatted)
  if (d.length === 0) {
    return ''
  }
  if (d.length !== 16) {
    return 'Card number must be exactly 16 digits.'
  }
  return ''
}

function getCvcErrorMessage(cvc) {
  const d = cvc.replace(/\D/g, '')
  if (d.length === 0) {
    return ''
  }
  if (d.length !== 3) {
    return 'CVC must be exactly 3 digits.'
  }
  return ''
}

function getCardholderErrorMessage(name) {
  if (!name.trim()) {
    return 'Enter the cardholder name.'
  }
  return ''
}

function App() {
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cart, setCart] = useState([])
  /** 'cart' | 'checkout' | 'payment' | 'confirmation' */
  const [checkoutStep, setCheckoutStep] = useState('cart')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderType, setOrderType] = useState('pickup')
  const [cardholderName, setCardholderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  /** 'percent' (10/15/20) or 'custom' */
  const [tipMode, setTipMode] = useState('percent')
  const [tipPercent, setTipPercent] = useState(15)
  /** Typed cents as digit string only (e.g. "200" -> $2.00) */
  const [customTipDigits, setCustomTipDigits] = useState('')
  /** True after user tries "Complete payment" with invalid tip — show custom tip error only then */
  const [paymentSubmitAttempted, setPaymentSubmitAttempted] = useState(false)
  /** When true, skip duplicate handling in onBeforeInput (already handled in onKeyDown). */
  const customTipHandledByKeyDown = useRef(false)

  const [orderSubmitLoading, setOrderSubmitLoading] = useState(false)
  const [orderSubmitError, setOrderSubmitError] = useState('')
  /** Set when POST /api/orders succeeds — used on the confirmation step */
  const [placedOrder, setPlacedOrder] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadMenu() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${API_BASE_URL}/api/menu`)
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`)
        }
        const data = await response.json()
        if (!cancelled) {
          setMenuItems(Array.isArray(data) ? data : [])
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load menu. Is the backend running on port 5087?'
          )
          setMenuItems([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadMenu()
    return () => {
      cancelled = true
    }
  }, [])

  function addToCart(menuItem) {
    setCart((prev) => {
      const idx = prev.findIndex((line) => line.menuItemId === menuItem.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + 1,
        }
        return next
      }
      return [
        ...prev,
        {
          menuItemId: menuItem.id,
          name: menuItem.name,
          description: menuItem.description,
          imageUrl: menuItem.imageUrl,
          price: Number(menuItem.price),
          quantity: 1,
        },
      ]
    })
  }

  function changeQuantity(menuItemId, delta) {
    if (menuItemId === PROMO_FREE_FRIES_ID) return
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.menuItemId !== menuItemId) return line
          const nextQty = line.quantity + delta
          if (nextQty <= 0) return null
          return { ...line, quantity: nextQty }
        })
        .filter(Boolean)
    )
  }

  function removeLine(menuItemId) {
    if (menuItemId === PROMO_FREE_FRIES_ID) return
    setCart((prev) => prev.filter((line) => line.menuItemId !== menuItemId))
  }

  function clearCart() {
    setCart([])
  }

  function scrollToMenu() {
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })
    setCheckoutStep('cart')
  }

  function handleCheckout() {
    if (cart.length === 0) return
    setCheckoutStep('checkout')
  }

  function handleContinueToPayment(e) {
    e.preventDefault()
    if (!customerName.trim() || !customerPhone.trim()) return
    setPaymentSubmitAttempted(false)
    setOrderSubmitError('')
    setCheckoutStep('payment')
  }

  function startNewOrder() {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setOrderType('pickup')
    setCardholderName('')
    setCardNumber('')
    setCardExpiry('')
    setCardCvc('')
    setTipMode('percent')
    setTipPercent(15)
    setCustomTipDigits('')
    setPaymentSubmitAttempted(false)
    setOrderSubmitError('')
    setOrderSubmitLoading(false)
    setPlacedOrder(null)
    setCheckoutStep('cart')
  }

  function handleCardNumberChange(e) {
    setCardNumber(formatCardNumberInput(e.target.value))
  }

  function handleExpiryChange(e) {
    setCardExpiry(formatExpiryInput(e.target.value))
  }

  function handleCvcChange(e) {
    setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 3))
  }

  function getCustomTipErrorMessage() {
    if (tipMode !== 'custom') return ''
    if (customTipDigits !== '' && /^\d+$/.test(customTipDigits)) {
      if (centsDigitsToDollars(customTipDigits) < 0) return 'Tip cannot be negative.'
      return ''
    }
    if (!paymentSubmitAttempted) return ''
    if (customTipDigits === '') return 'Enter a custom tip amount.'
    return 'Use digits only (amount in cents).'
  }

  /** Append one cent digit or delete last digit (keydown — works on most desktops). */
  function handleCustomTipKeyDown(e) {
    if (tipMode !== 'custom') return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Tab' || e.key === 'Escape') return

    if (e.key.length === 1 && e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      customTipHandledByKeyDown.current = true
      queueMicrotask(() => {
        customTipHandledByKeyDown.current = false
      })
      setCustomTipDigits((d) =>
        (d + e.key).slice(0, MAX_CUSTOM_TIP_CENTS_DIGITS)
      )
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      customTipHandledByKeyDown.current = true
      queueMicrotask(() => {
        customTipHandledByKeyDown.current = false
      })
      setCustomTipDigits((d) => d.slice(0, -1))
    }
  }

  /**
   * Same logic for mobile / soft keyboards where keydown may not carry digits.
   * If keydown already updated state, only preventDefault so we do not double-append.
   */
  function handleCustomTipBeforeInput(e) {
    if (tipMode !== 'custom') return
    if (customTipHandledByKeyDown.current) {
      customTipHandledByKeyDown.current = false
      e.preventDefault()
      return
    }

    const it = e.inputType
    if (
      it === 'deleteContentBackward' ||
      it === 'deleteContentForward' ||
      it === 'deleteByCut'
    ) {
      e.preventDefault()
      setCustomTipDigits((d) => d.slice(0, -1))
      return
    }
    if (it === 'insertFromPaste') {
      e.preventDefault()
      return
    }
    if (it === 'insertText' || it === 'insertCompositionText') {
      e.preventDefault()
      if (e.data && /^\d$/.test(e.data)) {
        setCustomTipDigits((d) =>
          (d + e.data).slice(0, MAX_CUSTOM_TIP_CENTS_DIGITS)
        )
      }
    }
  }

  function handleCustomTipPaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '')
    setCustomTipDigits(text.slice(0, MAX_CUSTOM_TIP_CENTS_DIGITS))
  }

  const checkoutFormValid =
    customerName.trim().length > 0 && customerPhone.trim().length > 0

  const cardDigits = cardNumberDigitsOnly(cardNumber)
  const cardNumberOk = cardDigits.length === 16
  const expiryCheck = validateExpiryDate(cardExpiry)
  const expiryOk = expiryCheck.ok
  const cvcDigitsOnly = cardCvc.replace(/\D/g, '')
  const cvcOk = cvcDigitsOnly.length === 3
  const cardholderOk = cardholderName.trim().length > 0

  const customTipOk =
    tipMode !== 'custom' ||
    (customTipDigits !== '' &&
      /^\d+$/.test(customTipDigits) &&
      centsDigitsToDollars(customTipDigits) >= 0)

  const paymentFormValid =
    cardholderOk && cardNumberOk && expiryOk && cvcOk && customTipOk

  const paymentCardFieldsValid =
    cardholderOk && cardNumberOk && expiryOk && cvcOk

  async function handleCompletePayment(e) {
    e.preventDefault()
    if (!paymentFormValid) {
      setPaymentSubmitAttempted(true)
      return
    }
    if (cart.length === 0) {
      setOrderSubmitError('Your cart is empty. Add items before completing payment.')
      return
    }

    setOrderSubmitError('')
    setOrderSubmitLoading(true)
    try {
      const payload = {
        customerName: customerName.trim(),
        items: cart.map((line) => ({
          id: line.menuItemId,
          name: line.name,
          price: line.price,
          quantity: line.quantity,
        })),
      }

      const res = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          data.message ||
          data.title ||
          data.detail ||
          `Could not place order (server returned ${res.status}).`
        throw new Error(msg)
      }

      setPlacedOrder(data)
      setPaymentSubmitAttempted(false)
      setCheckoutStep('confirmation')
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not place order. Please check your connection and try again.'
      setOrderSubmitError(msg)
    } finally {
      setOrderSubmitLoading(false)
    }
  }

  const cardholderErrorMsg = getCardholderErrorMessage(cardholderName)
  const cardNumberErrorMsg = getCardNumberErrorMessage(cardNumber)
  const expiryErrorMsg = expiryOk ? '' : expiryCheck.message
  const cvcErrorMsg = getCvcErrorMessage(cardCvc)
  const customTipErrorMsg = getCustomTipErrorMessage()

  function lineMeta(line) {
    if (line.isPromo) {
      return {
        imageUrl: line.imageUrl ?? '',
        description: line.description ?? '',
      }
    }
    const fromMenu = menuItems.find((m) => m.id === line.menuItemId)
    return {
      imageUrl: line.imageUrl ?? fromMenu?.imageUrl ?? '',
      description: line.description ?? fromMenu?.description ?? '',
    }
  }

  // Paid items only (promo rows are never in `cart` state)
  const paidSubtotal = cart.reduce(
    (sum, line) => sum + line.quantity * line.price,
    0
  )
  const taxAmount = paidSubtotal * TAX_RATE
  const orderTotal = paidSubtotal + taxAmount
  const tipAmount =
    tipMode === 'custom'
      ? (customTipDigits === '' ? 0 : centsDigitsToDollars(customTipDigits))
      : paidSubtotal * (tipPercent / 100)
  const paymentGrandTotal = paidSubtotal + taxAmount + tipAmount

  const cartLinesWithPromo = useMemo(() => {
    const fries = menuItems.find((m) => m.name === 'Classic Fries')
    const paid = cart.reduce((s, l) => s + l.quantity * l.price, 0)
    if (paid < 10 || !fries) {
      return cart
    }
    return [
      ...cart,
      {
        menuItemId: PROMO_FREE_FRIES_ID,
        name: fries.name,
        description: fries.description,
        imageUrl: fries.imageUrl,
        price: 0,
        quantity: 1,
        isPromo: true,
      },
    ]
  }, [cart, menuItems])

  const promoFriesActive =
    paidSubtotal >= 10 && Boolean(menuItems.find((m) => m.name === 'Classic Fries'))

  return (
    <div className="restaurant-app">
      <style>{`
        .restaurant-app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          text-align: left;
          font-family: system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
          color: #1a1a1a;
          background: linear-gradient(180deg, #fffef9 0%, #fff 45%, #faf8f5 100%);
        }

        .restaurant-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1rem 1.5rem;
          background: #fff;
          border-bottom: 1px solid #eee;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .restaurant-logo {
          font-size: 1.25rem;
          font-weight: 700;
          color: #c41e1e;
          letter-spacing: -0.02em;
          text-decoration: none;
        }

        .restaurant-nav-links {
          display: flex;
          gap: 1.75rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .restaurant-nav-links a {
          color: #333;
          text-decoration: none;
          font-weight: 500;
          font-size: 0.95rem;
          transition: color 0.2s;
        }

        .restaurant-nav-links a:hover {
          color: #c41e1e;
        }

        .restaurant-hero {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2.5rem;
          align-items: center;
          max-width: 1100px;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
          width: 100%;
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .restaurant-hero {
            grid-template-columns: 1fr;
            text-align: center;
            padding: 2rem 1.25rem 3rem;
          }

          .restaurant-hero-copy {
            order: 1;
          }

          .restaurant-hero-visual {
            order: 0;
          }
        }

        .restaurant-hero h1 {
          font-size: clamp(1.85rem, 4vw, 2.75rem);
          line-height: 1.15;
          margin: 0 0 1rem;
          color: #111;
          font-weight: 700;
          letter-spacing: -0.03em;
        }

        .restaurant-hero-sub {
          font-size: 1.05rem;
          line-height: 1.6;
          color: #555;
          margin: 0 0 1.75rem;
          max-width: 28rem;
        }

        @media (max-width: 768px) {
          .restaurant-hero-sub {
            margin-left: auto;
            margin-right: auto;
          }
        }

        .restaurant-btn-primary {
          display: inline-block;
          padding: 0.85rem 1.75rem;
          background: #c41e1e;
          color: #fff !important;
          font-weight: 600;
          font-size: 1rem;
          border: none;
          border-radius: 999px;
          cursor: pointer;
          text-decoration: none;
          box-shadow: 0 4px 14px rgba(196, 30, 30, 0.35);
          transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
        }

        .restaurant-btn-primary:hover {
          background: #a01818;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(196, 30, 30, 0.4);
        }

        .restaurant-btn-primary:focus-visible {
          outline: 3px solid #f4b942;
          outline-offset: 2px;
        }

        .restaurant-hero-visual {
          position: relative;
        }

        .restaurant-hero-visual img {
          width: 100%;
          max-width: 480px;
          height: auto;
          border-radius: 16px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.12);
          object-fit: cover;
          aspect-ratio: 4 / 3;
        }

        @media (max-width: 768px) {
          .restaurant-hero-visual img {
            max-width: 100%;
            margin: 0 auto;
            display: block;
          }
        }

        .restaurant-hero-badge {
          position: absolute;
          bottom: -0.5rem;
          left: 1rem;
          background: #f4b942;
          color: #1a1a1a;
          padding: 0.4rem 0.9rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        @media (max-width: 768px) {
          .restaurant-hero-badge {
            left: 50%;
            transform: translateX(-50%);
          }
        }

        #menu,
        #cart {
          scroll-margin-top: 5.5rem;
        }

        .restaurant-menu-wrap {
          border-top: 1px solid #eee;
          background: #fafafa;
        }

        .restaurant-menu-section {
          max-width: 1200px;
          margin: 0 auto;
          padding: 3rem 1.5rem 3.5rem;
          width: 100%;
          box-sizing: border-box;
        }

        .restaurant-cart-page {
          width: 100%;
          background: #f3f4f6;
          border-top: 1px solid #e5e7eb;
          padding: 2.5rem 1.25rem 4rem;
          box-sizing: border-box;
        }

        .restaurant-cart-page-inner {
          max-width: 720px;
          margin: 0 auto;
        }

        .restaurant-cart-page-title {
          margin: 0 0 0.35rem;
          font-size: clamp(1.75rem, 4vw, 2.25rem);
          font-weight: 800;
          color: #111;
          letter-spacing: -0.03em;
        }

        .restaurant-cart-page-sub {
          margin: 0 0 1.5rem;
          font-size: 0.95rem;
          color: #6b7280;
        }

        .restaurant-cart-promo {
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          border: 1px solid #fdba74;
          border-radius: 12px;
          padding: 1rem 1.25rem;
          margin-bottom: 1.75rem;
        }

        .restaurant-cart-promo-title {
          margin: 0 0 0.35rem;
          font-size: 1rem;
          font-weight: 700;
          color: #9a3412;
        }

        .restaurant-cart-promo-sub {
          margin: 0;
          font-size: 0.875rem;
          color: #c2410c;
          line-height: 1.45;
        }

        .restaurant-cart-empty-box {
          background: #fff;
          border-radius: 16px;
          border: 1px dashed #d1d5db;
          padding: 2.5rem 1.5rem;
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .restaurant-cart-empty-box p {
          margin: 0;
          color: #6b7280;
          font-size: 1rem;
          line-height: 1.6;
        }

        .restaurant-cart-empty-icon {
          font-size: 2.5rem;
          margin-bottom: 0.75rem;
          line-height: 1;
        }

        .restaurant-cart-item-card {
          background: #fff;
          border-radius: 14px;
          border: 1px solid #e5e7eb;
          padding: 1rem 1rem;
          margin-bottom: 0.85rem;
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        }

        .restaurant-cart-item-img {
          width: 96px;
          height: 96px;
          object-fit: cover;
          border-radius: 10px;
          flex-shrink: 0;
          background: #f3f4f6;
        }

        .restaurant-cart-item-body {
          flex: 1;
          min-width: 0;
        }

        .restaurant-cart-item-name {
          margin: 0 0 0.35rem;
          font-size: 1.05rem;
          font-weight: 700;
          color: #111;
        }

        .restaurant-cart-item-desc {
          margin: 0;
          font-size: 0.8rem;
          line-height: 1.45;
          color: #6b7280;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .restaurant-cart-item-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 0.65rem;
        }

        .restaurant-cart-item-text {
          min-width: 0;
        }

        .restaurant-cart-item-bottom {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 1rem;
        }

        .restaurant-cart-item-total {
          font-weight: 800;
          font-size: 1.05rem;
          color: #111;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .restaurant-cart-totals-block {
          background: #fff;
          border-radius: 14px;
          border: 1px solid #e5e7eb;
          padding: 1.25rem 1.25rem;
          margin-top: 0.5rem;
          margin-bottom: 1.25rem;
        }

        .restaurant-cart-totals-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.95rem;
          color: #4b5563;
          margin-bottom: 0.5rem;
        }

        .restaurant-cart-totals-row:last-child {
          margin-bottom: 0;
        }

        .restaurant-cart-totals-row.total {
          border-top: 1px solid #e5e7eb;
          padding-top: 0.75rem;
          margin-top: 0.75rem;
          font-size: 1.15rem;
          font-weight: 800;
          color: #111;
        }

        .restaurant-btn-checkout-lg {
          width: 100%;
          padding: 1rem 1.25rem;
          font-size: 1.05rem;
          font-weight: 800;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          background: #c41e1e;
          color: #fff;
          box-shadow: 0 4px 14px rgba(196, 30, 30, 0.35);
          transition: background 0.15s, transform 0.15s;
        }

        .restaurant-btn-checkout-lg:hover:not(:disabled) {
          background: #a01818;
          transform: translateY(-1px);
        }

        .restaurant-btn-checkout-lg:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
        }

        .restaurant-btn-checkout-lg:focus-visible {
          outline: 3px solid #f4b942;
          outline-offset: 2px;
        }

        .restaurant-link-continue {
          display: block;
          width: 100%;
          margin-top: 1rem;
          padding: 0.5rem;
          text-align: center;
          font-size: 0.95rem;
          font-weight: 600;
          color: #c41e1e;
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
        }

        .restaurant-link-continue:hover {
          color: #8b1414;
        }

        .restaurant-link-clear {
          display: block;
          text-align: center;
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: #9ca3af;
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
          width: 100%;
        }

        .restaurant-checkout-flow {
          max-width: 560px;
          margin: 0 auto;
        }

        .restaurant-checkout-card {
          background: #fff;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          padding: 2rem 1.5rem 2.25rem;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
        }

        .restaurant-checkout-card > h1 {
          margin: 0 0 0.35rem;
          font-size: 1.75rem;
          font-weight: 800;
          color: #111;
          text-align: center;
          letter-spacing: -0.02em;
        }

        .restaurant-checkout-card > .restaurant-checkout-lead {
          margin: 0 0 1.75rem;
          text-align: center;
          font-size: 0.92rem;
          color: #6b7280;
          line-height: 1.5;
        }

        .restaurant-checkout-section {
          margin-bottom: 1.75rem;
        }

        .restaurant-checkout-section:last-of-type {
          margin-bottom: 0;
        }

        .restaurant-checkout-section h2 {
          margin: 0 0 1rem;
          font-size: 1rem;
          font-weight: 700;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .restaurant-checkout-summary-line {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 1rem;
          font-size: 0.92rem;
          color: #4b5563;
          margin-bottom: 0.5rem;
        }

        .restaurant-checkout-summary-line strong {
          color: #111;
          font-weight: 600;
        }

        .restaurant-checkout-summary-line .line-name {
          flex: 1;
          min-width: 0;
        }

        .restaurant-checkout-summary-divider {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 1rem 0;
        }

        .restaurant-checkout-field {
          margin-bottom: 1rem;
        }

        .restaurant-checkout-field label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.35rem;
        }

        .restaurant-checkout-field input[type='text'],
        .restaurant-checkout-field input[type='tel'] {
          width: 100%;
          box-sizing: border-box;
          padding: 0.65rem 0.75rem;
          font-size: 1rem;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          background: #fff;
        }

        .restaurant-checkout-field input:focus {
          outline: none;
          border-color: #c41e1e;
          box-shadow: 0 0 0 3px rgba(196, 30, 30, 0.15);
        }

        .restaurant-checkout-field input.input-invalid {
          border-color: #dc2626;
        }

        .restaurant-field-error {
          font-size: 0.8rem;
          color: #b91c1c;
          margin: 0.35rem 0 0;
          line-height: 1.35;
        }

        .restaurant-checkout-radio-group {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        .restaurant-checkout-radio {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: 0.95rem;
          color: #374151;
        }

        .restaurant-checkout-radio input {
          width: 1.1rem;
          height: 1.1rem;
          accent-color: #c41e1e;
        }

        .restaurant-btn-continue-payment {
          width: 100%;
          margin-top: 1.5rem;
          padding: 1rem 1.25rem;
          font-size: 1.05rem;
          font-weight: 800;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          background: #c41e1e;
          color: #fff;
          box-shadow: 0 4px 14px rgba(196, 30, 30, 0.35);
          transition: background 0.15s, opacity 0.15s;
        }

        .restaurant-btn-continue-payment:hover:not(:disabled) {
          background: #a01818;
        }

        .restaurant-btn-continue-payment:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .restaurant-checkout-nav {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1.25rem;
        }

        .restaurant-payment-page {
          text-align: left;
        }

        .restaurant-payment-page > h1 {
          text-align: center;
        }

        .restaurant-payment-page .restaurant-checkout-lead {
          text-align: center;
        }

        .restaurant-payment-demo {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e3a8a;
          padding: 0.7rem 0.9rem;
          border-radius: 10px;
          font-size: 0.88rem;
          line-height: 1.45;
          margin-bottom: 1.25rem;
          text-align: center;
        }

        .restaurant-payment-row2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }

        @media (max-width: 480px) {
          .restaurant-payment-row2 {
            grid-template-columns: 1fr;
          }
        }

        .restaurant-tip-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .restaurant-tip-btn {
          flex: 1;
          min-width: 4.5rem;
          padding: 0.7rem 0.75rem;
          border-radius: 10px;
          border: 2px solid #e5e7eb;
          background: #fff;
          font-weight: 700;
          font-size: 0.95rem;
          color: #374151;
          cursor: pointer;
          transition:
            border-color 0.15s,
            background 0.15s,
            color 0.15s;
        }

        .restaurant-tip-btn:hover {
          border-color: #d1d5db;
        }

        .restaurant-tip-btn.is-selected {
          border-color: #c41e1e;
          background: #fef2f2;
          color: #c41e1e;
        }

        .restaurant-tip-custom-field {
          margin-top: 1rem;
          max-width: 16rem;
        }

        .restaurant-tip-custom-field label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.35rem;
        }

        .restaurant-tip-custom-field .tip-dollar-prefix {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .restaurant-tip-custom-field .tip-dollar-prefix span {
          font-weight: 700;
          color: #374151;
        }

        .restaurant-tip-custom-field input {
          flex: 1;
          min-width: 0;
          box-sizing: border-box;
          padding: 0.65rem 0.75rem;
          font-size: 1rem;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          background: #fff;
        }

        .restaurant-tip-custom-field input:focus {
          outline: none;
          border-color: #c41e1e;
          box-shadow: 0 0 0 3px rgba(196, 30, 30, 0.15);
        }

        .restaurant-tip-custom-field input.input-invalid {
          border-color: #dc2626;
        }

        .restaurant-payment-summary-meta {
          font-size: 0.9rem;
          color: #4b5563;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .restaurant-payment-summary-meta div {
          margin-bottom: 0.35rem;
        }

        .restaurant-confirmation-card {
          text-align: center;
        }

        .restaurant-confirmation-card .restaurant-confirmation-icon {
          font-size: 2.75rem;
          line-height: 1;
          margin-bottom: 0.5rem;
        }

        .restaurant-confirmation-card h1 {
          margin: 0 0 0.5rem;
          font-size: 1.6rem;
          font-weight: 800;
          color: #111;
        }

        .restaurant-confirmation-card .restaurant-checkout-lead {
          margin-bottom: 1.5rem;
        }

        .restaurant-confirmation-summary {
          text-align: left;
          background: #f9fafb;
          border-radius: 12px;
          padding: 1rem 1.1rem;
          margin-bottom: 1.25rem;
          font-size: 0.9rem;
          color: #374151;
        }

        .restaurant-confirmation-actions {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          align-items: center;
        }

        .restaurant-btn-back-cart {
          padding: 0.75rem 1.5rem;
          font-weight: 700;
          border-radius: 10px;
          border: 1px solid #d1d5db;
          background: #fff;
          cursor: pointer;
          font-size: 0.95rem;
        }

        .restaurant-btn-back-cart:hover {
          background: #f9fafb;
        }

        .restaurant-menu-head {
          margin-bottom: 1.75rem;
          text-align: center;
        }

        .restaurant-menu-head h2 {
          margin: 0 0 0.35rem;
          font-size: 1.75rem;
          color: #111;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .restaurant-menu-head p {
          margin: 0;
          color: #666;
          font-size: 0.95rem;
        }

        .restaurant-menu-status {
          text-align: center;
          padding: 2.5rem 1rem;
          color: #555;
          font-size: 1rem;
        }

        .restaurant-menu-error {
          background: #fff5f5;
          border: 1px solid #f5c2c2;
          color: #9b1c1c;
          border-radius: 12px;
          padding: 1rem 1.25rem;
          max-width: 32rem;
          margin: 0 auto;
          text-align: center;
          font-size: 0.95rem;
        }

        .restaurant-menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1.5rem;
        }

        .restaurant-card {
          background: #fff;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
          border: 1px solid #eee;
          display: flex;
          flex-direction: column;
          transition: box-shadow 0.2s, transform 0.2s;
        }

        .restaurant-card:hover {
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .restaurant-card-image-wrap {
          position: relative;
          background: #f0f0f0;
        }

        .restaurant-card-category {
          position: absolute;
          top: 0.65rem;
          left: 0.65rem;
          background: rgba(255, 255, 255, 0.95);
          color: #c41e1e;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 0.25rem 0.55rem;
          border-radius: 6px;
        }

        .restaurant-card-body {
          padding: 1.1rem 1.15rem 1.25rem;
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 0.5rem;
        }

        .restaurant-card-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 700;
          color: #111;
          line-height: 1.25;
        }

        .restaurant-card-desc {
          margin: 0;
          font-size: 0.85rem;
          line-height: 1.5;
          color: #666;
          flex: 1;
        }

        .restaurant-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-top: 0.35rem;
          flex-wrap: wrap;
        }

        .restaurant-card-price {
          font-size: 1.15rem;
          font-weight: 700;
          color: #1a1a1a;
        }

        .restaurant-card-btn {
          padding: 0.55rem 1rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: #fff;
          background: #c41e1e;
          border: none;
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s, transform 0.15s;
        }

        .restaurant-card-btn:hover {
          background: #a01818;
          transform: scale(1.02);
        }

        .restaurant-card-btn:focus-visible {
          outline: 2px solid #f4b942;
          outline-offset: 2px;
        }

        .restaurant-cart-item-card.is-promo {
          border-color: #fcd34d;
          background: linear-gradient(180deg, #fffbeb 0%, #fff 100%);
        }

        .restaurant-cart-promo-pill {
          display: inline-block;
          margin-left: 0.4rem;
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #b45309;
          background: #fef3c7;
          padding: 0.2rem 0.45rem;
          border-radius: 6px;
          vertical-align: middle;
        }

        .restaurant-cart-promo-note {
          font-size: 0.8rem;
          color: #92400e;
          margin: 0.35rem 0 0;
        }

        .restaurant-qty-btn {
          width: 2rem;
          height: 2rem;
          border-radius: 8px;
          border: 1px solid #ddd;
          background: #fafafa;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #333;
          transition: background 0.15s, border-color 0.15s;
        }

        .restaurant-qty-btn:hover {
          background: #f0f0f0;
          border-color: #ccc;
        }

        .restaurant-qty-btn:focus-visible {
          outline: 2px solid #f4b942;
          outline-offset: 1px;
        }

        .restaurant-cart-qty {
          font-weight: 600;
          min-width: 1.5rem;
          text-align: center;
          font-size: 0.95rem;
        }

        .restaurant-btn-remove {
          font-size: 0.8rem;
          font-weight: 600;
          color: #c41e1e;
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
          padding: 0.25rem 0;
        }

        .restaurant-btn-remove:hover {
          color: #8b1414;
        }

        .restaurant-home-promo {
          padding: 1.5rem 1.25rem 2rem;
          display: flex;
          justify-content: center;
          background: linear-gradient(180deg, #fffef9 0%, #fafafa 100%);
        }

        .restaurant-home-promo-card {
          max-width: 920px;
          width: 100%;
          background: #f3f4f6;
          border-radius: 16px;
          padding: 1.5rem 1.75rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          text-align: center;
          box-sizing: border-box;
          border: 1px solid #e5e7eb;
        }

        .restaurant-home-promo-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #c41e1e;
          margin: 0 0 0.65rem;
        }

        .restaurant-home-promo-title {
          margin: 0 0 0.5rem;
          font-size: clamp(1.15rem, 3vw, 1.45rem);
          font-weight: 700;
          color: #111;
          line-height: 1.35;
        }

        .restaurant-home-promo-sub {
          margin: 0 0 1.35rem;
          font-size: 0.95rem;
          color: #6b7280;
          line-height: 1.55;
        }

        .restaurant-home-promo-card .restaurant-btn-primary {
          display: inline-block;
        }
      `}</style>

      <header>
        <nav className="restaurant-nav" aria-label="Main">
          <a href="#home" className="restaurant-logo">
            McDonald&apos;s Clone
          </a>
          <ul className="restaurant-nav-links">
            <li>
              <a href="#home">Home</a>
            </li>
            <li>
              <a href="#menu">Menu</a>
            </li>
            <li>
              <a href="#cart">Cart</a>
            </li>
          </ul>
        </nav>
      </header>

      <main id="home">
        <section className="restaurant-hero" aria-labelledby="hero-title">
          <div className="restaurant-hero-copy">
            <h1 id="hero-title">
              Fresh Burgers. Fast Ordering. Easy Experience.
            </h1>
            <p className="restaurant-hero-sub">
              Order your favorites in a few taps—browse the menu, customize
              items, and check out when you&apos;re ready. Built for speed,
              clarity, and a smooth dining-style experience online.
            </p>
            <a className="restaurant-btn-primary" href="#menu">
              View Menu
            </a>
          </div>
          <div className="restaurant-hero-visual">
            <img
              src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80"
              alt="Classic burger with lettuce, cheese, and sesame bun"
              width={800}
              height={600}
            />
            <span className="restaurant-hero-badge">Fan favorite</span>
          </div>
        </section>

        <section
          className="restaurant-home-promo"
          aria-labelledby="home-promo-title"
        >
          <div className="restaurant-home-promo-card">
            <p className="restaurant-home-promo-label">Today&apos;s Deal</p>
            <h2 id="home-promo-title" className="restaurant-home-promo-title">
              Free Medium Classic Fries with orders of $10 or more
            </h2>
            <p className="restaurant-home-promo-sub">
              Offer applied automatically at checkout.
            </p>
            <a className="restaurant-btn-primary" href="#menu">
              Order Now
            </a>
          </div>
        </section>

        <div className="restaurant-menu-wrap">
          <section id="menu" className="restaurant-menu-section" aria-label="Menu">
            <div className="restaurant-menu-head">
              <h2>Our menu</h2>
              <p>Loaded fresh from the kitchen API—pick something delicious.</p>
            </div>

            {loading ? (
              <p className="restaurant-menu-status">Loading menu…</p>
            ) : null}

            {!loading && error ? (
              <div className="restaurant-menu-error" role="alert">
                {error}
              </div>
            ) : null}

            {!loading && !error && menuItems.length === 0 ? (
              <p className="restaurant-menu-status">No items to show.</p>
            ) : null}

            {!loading && !error && menuItems.length > 0 ? (
              <div className="restaurant-menu-grid">
                {menuItems.map((item) => (
                  <article key={item.id} className="restaurant-card">
                    <div className="restaurant-card-image-wrap">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        style={{
                          width: '100%',
                          height: '220px',
                          objectFit: 'cover',
                        }}
                      />
                      <span className="restaurant-card-category">
                        {item.category}
                      </span>
                    </div>
                    <div className="restaurant-card-body">
                      <h3 className="restaurant-card-title">{item.name}</h3>
                      <p className="restaurant-card-desc">{item.description}</p>
                      <div className="restaurant-card-footer">
                        <span className="restaurant-card-price">
                          ${Number(item.price).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          className="restaurant-card-btn"
                          onClick={() => addToCart(item)}
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <section id="cart" className="restaurant-cart-page" aria-label="Shopping cart">
          <div className="restaurant-cart-page-inner">
            {checkoutStep === 'checkout' ? (
              <div className="restaurant-checkout-flow">
                <form
                  className="restaurant-checkout-card"
                  onSubmit={handleContinueToPayment}
                >
                  <h1>Checkout</h1>
                  <p className="restaurant-checkout-lead">
                    Review your order and add your details to continue.
                  </p>

                  <div className="restaurant-checkout-section">
                    <h2>Order summary</h2>
                    {cartLinesWithPromo.map((line) => {
                      const lineTotal = line.quantity * line.price
                      const label = line.isPromo
                        ? `${line.name} (Free Promo)`
                        : line.name
                      return (
                        <div
                          key={line.menuItemId}
                          className="restaurant-checkout-summary-line"
                        >
                          <span className="line-name">
                            {label}{' '}
                            <strong>×{line.quantity}</strong>
                          </span>
                          <span>${money(lineTotal)}</span>
                        </div>
                      )
                    })}
                    <hr className="restaurant-checkout-summary-divider" />
                    <div className="restaurant-checkout-summary-line">
                      <span>Subtotal (paid items)</span>
                      <span>${money(paidSubtotal)}</span>
                    </div>
                    {promoFriesActive ? (
                      <div className="restaurant-checkout-summary-line">
                        <span>Free promo · Classic Fries</span>
                        <span>$0.00</span>
                      </div>
                    ) : null}
                    <div className="restaurant-checkout-summary-line">
                      <span>Tax (9.25%)</span>
                      <span>${money(taxAmount)}</span>
                    </div>
                    <div className="restaurant-checkout-summary-line">
                      <strong>Total</strong>
                      <strong>${money(orderTotal)}</strong>
                    </div>
                  </div>

                  <div className="restaurant-checkout-section">
                    <h2>Your details</h2>
                    <div className="restaurant-checkout-field">
                      <label htmlFor="checkout-name">Full name</label>
                      <input
                        id="checkout-name"
                        name="customerName"
                        type="text"
                        autoComplete="name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Jane Doe"
                        required
                      />
                    </div>
                    <div className="restaurant-checkout-field">
                      <label htmlFor="checkout-phone">Phone number</label>
                      <input
                        id="checkout-phone"
                        name="customerPhone"
                        type="tel"
                        autoComplete="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                        required
                      />
                    </div>
                  </div>

                  <div className="restaurant-checkout-section">
                    <h2>Order type</h2>
                    <div className="restaurant-checkout-radio-group">
                      <label className="restaurant-checkout-radio">
                        <input
                          type="radio"
                          name="orderType"
                          value="pickup"
                          checked={orderType === 'pickup'}
                          onChange={() => setOrderType('pickup')}
                        />
                        Pickup
                      </label>
                      <label className="restaurant-checkout-radio">
                        <input
                          type="radio"
                          name="orderType"
                          value="dine-in"
                          checked={orderType === 'dine-in'}
                          onChange={() => setOrderType('dine-in')}
                        />
                        Dine-in
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="restaurant-btn-continue-payment"
                    disabled={!checkoutFormValid}
                  >
                    Continue to payment
                  </button>

                  <div className="restaurant-checkout-nav">
                    <button
                      type="button"
                      className="restaurant-btn-back-cart"
                      onClick={() => setCheckoutStep('cart')}
                    >
                      Back to cart
                    </button>
                    <button
                      type="button"
                      className="restaurant-link-continue"
                      onClick={scrollToMenu}
                    >
                      Continue shopping
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {checkoutStep === 'payment' ? (
              <div className="restaurant-checkout-flow">
                <form
                  className="restaurant-checkout-card restaurant-payment-page"
                  onSubmit={handleCompletePayment}
                >
                  <h1>Payment</h1>
                  <p className="restaurant-checkout-lead">
                    Enter demo card details and choose a tip. Nothing is charged.
                  </p>

                  <div className="restaurant-payment-demo">
                    Demo payment only — no card is charged.
                  </div>

                  {orderSubmitError ? (
                    <p
                      className="restaurant-field-error"
                      role="alert"
                      style={{ marginBottom: '1rem' }}
                    >
                      {orderSubmitError}
                    </p>
                  ) : null}

                  <div className="restaurant-checkout-section">
                    <h2>Card</h2>
                    <div className="restaurant-checkout-field">
                      <label htmlFor="pay-card-name">Cardholder name</label>
                      <input
                        id="pay-card-name"
                        name="cardholderName"
                        type="text"
                        autoComplete="cc-name"
                        value={cardholderName}
                        onChange={(e) => setCardholderName(e.target.value)}
                        placeholder="Name on card"
                        className={
                          cardholderErrorMsg ? 'input-invalid' : undefined
                        }
                        aria-invalid={Boolean(cardholderErrorMsg)}
                      />
                      {cardholderErrorMsg ? (
                        <p className="restaurant-field-error" role="alert">
                          {cardholderErrorMsg}
                        </p>
                      ) : null}
                    </div>
                    <div className="restaurant-checkout-field">
                      <label htmlFor="pay-card-number">Card number</label>
                      <input
                        id="pay-card-number"
                        name="cardNumber"
                        type="text"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        placeholder="4242 4242 4242 4242"
                        className={
                          cardNumberErrorMsg ? 'input-invalid' : undefined
                        }
                        aria-invalid={Boolean(cardNumberErrorMsg)}
                      />
                      {cardNumberErrorMsg ? (
                        <p className="restaurant-field-error" role="alert">
                          {cardNumberErrorMsg}
                        </p>
                      ) : null}
                    </div>
                    <div className="restaurant-payment-row2">
                      <div className="restaurant-checkout-field">
                        <label htmlFor="pay-card-expiry">Expiry date</label>
                        <input
                          id="pay-card-expiry"
                          name="cardExpiry"
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          value={cardExpiry}
                          onChange={handleExpiryChange}
                          placeholder="MM/YY"
                          className={
                            expiryErrorMsg ? 'input-invalid' : undefined
                          }
                          aria-invalid={Boolean(expiryErrorMsg)}
                        />
                        {expiryErrorMsg ? (
                          <p className="restaurant-field-error" role="alert">
                            {expiryErrorMsg}
                          </p>
                        ) : null}
                      </div>
                      <div className="restaurant-checkout-field">
                        <label htmlFor="pay-card-cvc">CVC</label>
                        <input
                          id="pay-card-cvc"
                          name="cardCvc"
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          value={cardCvc}
                          onChange={handleCvcChange}
                          placeholder="123"
                          maxLength={3}
                          className={cvcErrorMsg ? 'input-invalid' : undefined}
                          aria-invalid={Boolean(cvcErrorMsg)}
                        />
                        {cvcErrorMsg ? (
                          <p className="restaurant-field-error" role="alert">
                            {cvcErrorMsg}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="restaurant-checkout-section">
                    <h2>Tip</h2>
                    <div className="restaurant-tip-buttons">
                      {[10, 15, 20].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          className={
                            tipMode === 'percent' && tipPercent === pct
                              ? 'restaurant-tip-btn is-selected'
                              : 'restaurant-tip-btn'
                          }
                          onClick={() => {
                            setTipMode('percent')
                            setTipPercent(pct)
                            setPaymentSubmitAttempted(false)
                          }}
                        >
                          {pct}%
                        </button>
                      ))}
                      <button
                        type="button"
                        className={
                          tipMode === 'custom'
                            ? 'restaurant-tip-btn is-selected'
                            : 'restaurant-tip-btn'
                        }
                        onClick={() => {
                          setTipMode('custom')
                          setPaymentSubmitAttempted(false)
                        }}
                      >
                        Custom
                      </button>
                    </div>
                    {tipMode === 'custom' ? (
                      <div className="restaurant-tip-custom-field">
                        <label htmlFor="pay-custom-tip">
                          Custom tip amount
                        </label>
                        <div className="tip-dollar-prefix">
                          <span aria-hidden>$</span>
                          <input
                            id="pay-custom-tip"
                            name="customTip"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={formatCustomTipDisplay(customTipDigits)}
                            onChange={() => {}}
                            onBeforeInput={handleCustomTipBeforeInput}
                            onKeyDown={handleCustomTipKeyDown}
                            onPaste={handleCustomTipPaste}
                            placeholder="0.00"
                            className={
                              customTipErrorMsg ? 'input-invalid' : undefined
                            }
                            aria-invalid={Boolean(customTipErrorMsg)}
                          />
                        </div>
                        {customTipErrorMsg ? (
                          <p className="restaurant-field-error" role="alert">
                            {customTipErrorMsg}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="restaurant-checkout-section">
                    <h2>Order summary</h2>
                    <div className="restaurant-payment-summary-meta">
                      <div>
                        <strong>Customer:</strong> {customerName.trim()}
                      </div>
                      <div>
                        <strong>Phone:</strong> {customerPhone.trim()}
                      </div>
                      <div>
                        <strong>Order type:</strong>{' '}
                        {orderType === 'pickup' ? 'Pickup' : 'Dine-in'}
                      </div>
                    </div>
                    {cartLinesWithPromo.map((line) => {
                      const lineTotal = line.quantity * line.price
                      const label = line.isPromo
                        ? `${line.name} (Free Promo)`
                        : line.name
                      return (
                        <div
                          key={line.menuItemId}
                          className="restaurant-checkout-summary-line"
                        >
                          <span className="line-name">
                            {label} <strong>×{line.quantity}</strong>
                          </span>
                          <span>${money(lineTotal)}</span>
                        </div>
                      )
                    })}
                    <hr className="restaurant-checkout-summary-divider" />
                    <div className="restaurant-checkout-summary-line">
                      <span>Subtotal (paid items)</span>
                      <span>${money(paidSubtotal)}</span>
                    </div>
                    {promoFriesActive ? (
                      <div className="restaurant-checkout-summary-line">
                        <span>Free promo · Classic Fries</span>
                        <span>$0.00</span>
                      </div>
                    ) : null}
                    <div className="restaurant-checkout-summary-line">
                      <span>Tax (9.25%)</span>
                      <span>${money(taxAmount)}</span>
                    </div>
                    <div className="restaurant-checkout-summary-line">
                      <span>
                        {tipMode === 'custom'
                          ? 'Tip (custom)'
                          : `Tip (${tipPercent}%)`}
                      </span>
                      <span>${money(tipAmount)}</span>
                    </div>
                    <div className="restaurant-checkout-summary-line">
                      <strong>Final total</strong>
                      <strong>${money(paymentGrandTotal)}</strong>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="restaurant-btn-continue-payment"
                    disabled={!paymentCardFieldsValid || orderSubmitLoading}
                    aria-busy={orderSubmitLoading}
                  >
                    {orderSubmitLoading ? 'Placing order…' : 'Complete payment'}
                  </button>

                  <div className="restaurant-checkout-nav">
                    <button
                      type="button"
                      className="restaurant-link-continue"
                      onClick={() => {
                        setOrderSubmitError('')
                        setCheckoutStep('checkout')
                      }}
                    >
                      Back to checkout
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {checkoutStep === 'confirmation' ? (
              <div className="restaurant-checkout-flow">
                <div className="restaurant-checkout-card restaurant-confirmation-card">
                  <div className="restaurant-confirmation-icon" aria-hidden>
                    ✓
                  </div>
                  <h1>Order confirmed</h1>
                  <p className="restaurant-checkout-lead">
                    Thanks, {customerName.trim()}! Your order is placed
                    {placedOrder?.orderId != null
                      ? ` (order #${placedOrder.orderId})`
                      : ''}
                    . We&apos;ll send a text to {customerPhone.trim()} when it&apos;s
                    ready.
                  </p>
                  <div className="restaurant-confirmation-summary">
                    {placedOrder?.orderId != null ? (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <strong>Order number:</strong> #{placedOrder.orderId}
                      </div>
                    ) : null}
                    <div>
                      <strong>Customer:</strong> {customerName.trim()}
                    </div>
                    <div style={{ marginTop: '0.35rem' }}>
                      <strong>Order type:</strong>{' '}
                      {orderType === 'pickup' ? 'Pickup' : 'Dine-in'}
                    </div>
                    <hr className="restaurant-checkout-summary-divider" />
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Items</strong>
                    </div>
                    {cartLinesWithPromo.map((line) => {
                      const lineTotal = line.quantity * line.price
                      const label = line.isPromo
                        ? `${line.name} (Free Promo)`
                        : line.name
                      return (
                        <div
                          key={line.menuItemId}
                          className="restaurant-checkout-summary-line"
                        >
                          <span className="line-name">
                            {label} <strong>×{line.quantity}</strong>
                          </span>
                          <span>${money(lineTotal)}</span>
                        </div>
                      )
                    })}
                    <hr className="restaurant-checkout-summary-divider" />
                    <div className="restaurant-checkout-summary-line">
                      <span>Subtotal (paid items)</span>
                      <span>${money(paidSubtotal)}</span>
                    </div>
                    {promoFriesActive ? (
                      <div className="restaurant-checkout-summary-line">
                        <span>Free promo · Classic Fries</span>
                        <span>$0.00</span>
                      </div>
                    ) : null}
                    <div className="restaurant-checkout-summary-line">
                      <span>Tax (9.25%)</span>
                      <span>${money(taxAmount)}</span>
                    </div>
                    <div className="restaurant-checkout-summary-line">
                      <span>
                        {tipMode === 'custom'
                          ? 'Tip (custom)'
                          : `Tip (${tipPercent}%)`}
                      </span>
                      <span>${money(tipAmount)}</span>
                    </div>
                    <div className="restaurant-checkout-summary-line">
                      <strong>Total (demo)</strong>
                      <strong>${money(paymentGrandTotal)}</strong>
                    </div>
                  </div>
                  <div className="restaurant-confirmation-actions">
                    <button
                      type="button"
                      className="restaurant-btn-continue-payment"
                      onClick={startNewOrder}
                    >
                      Start new order
                    </button>
                    <button
                      type="button"
                      className="restaurant-link-continue"
                      onClick={scrollToMenu}
                    >
                      Continue shopping
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {checkoutStep === 'cart' ? (
              <>
                <h1 className="restaurant-cart-page-title">Your cart</h1>
                <p className="restaurant-cart-page-sub">
                  Pickup · Order online · Est. ready in 12–18 min
                </p>

                <div className="restaurant-cart-promo">
                  <p className="restaurant-cart-promo-title">
                    Free Medium Classic Fries with orders of $10 or more
                  </p>
                  <p className="restaurant-cart-promo-sub">
                    Offer applied automatically at checkout.
                  </p>
                </div>

                {cart.length === 0 ? (
                  <div className="restaurant-cart-empty-box">
                    <div className="restaurant-cart-empty-icon" aria-hidden>
                      🛒
                    </div>
                    <p>
                      Your cart is empty. Browse the menu to add items—your
                      order builds here before you check out.
                    </p>
                  </div>
                ) : (
                  <>
                    {cartLinesWithPromo.map((line) => {
                      const meta = lineMeta(line)
                      const lineTotal = line.quantity * line.price
                      return (
                        <div
                          key={line.menuItemId}
                          className={
                            line.isPromo
                              ? 'restaurant-cart-item-card is-promo'
                              : 'restaurant-cart-item-card'
                          }
                        >
                          <img
                            className="restaurant-cart-item-img"
                            src={meta.imageUrl}
                            alt={line.name}
                          />
                          <div className="restaurant-cart-item-body">
                            <div className="restaurant-cart-item-top">
                              <div className="restaurant-cart-item-text">
                                <h3 className="restaurant-cart-item-name">
                                  {line.name}
                                  {line.isPromo ? (
                                    <span className="restaurant-cart-promo-pill">
                                      Free Promo
                                    </span>
                                  ) : null}
                                </h3>
                                {line.isPromo ? (
                                  <p className="restaurant-cart-promo-note">
                                    Included with your order—adjust cart
                                    total to change eligibility.
                                  </p>
                                ) : null}
                                {!line.isPromo && meta.description ? (
                                  <p className="restaurant-cart-item-desc">
                                    {meta.description}
                                  </p>
                                ) : null}
                              </div>
                              <span className="restaurant-cart-item-total">
                                ${money(lineTotal)}
                              </span>
                            </div>
                            {line.isPromo ? (
                              <div className="restaurant-cart-item-bottom">
                                <span
                                  className="restaurant-cart-qty"
                                  style={{ fontSize: '0.9rem', color: '#6b7280' }}
                                >
                                  Qty {line.quantity} (promo)
                                </span>
                              </div>
                            ) : (
                              <div className="restaurant-cart-item-bottom">
                                <button
                                  type="button"
                                  className="restaurant-qty-btn"
                                  aria-label={`Decrease ${line.name}`}
                                  onClick={() =>
                                    changeQuantity(line.menuItemId, -1)
                                  }
                                >
                                  −
                                </button>
                                <span className="restaurant-cart-qty">
                                  {line.quantity}
                                </span>
                                <button
                                  type="button"
                                  className="restaurant-qty-btn"
                                  aria-label={`Increase ${line.name}`}
                                  onClick={() =>
                                    changeQuantity(line.menuItemId, 1)
                                  }
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  className="restaurant-btn-remove"
                                  onClick={() => removeLine(line.menuItemId)}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    <div className="restaurant-cart-totals-block">
                      <div className="restaurant-cart-totals-row">
                        <span>Subtotal (paid items)</span>
                        <span>${money(paidSubtotal)}</span>
                      </div>
                      {promoFriesActive ? (
                        <div className="restaurant-cart-totals-row">
                          <span>Free promo · Classic Fries</span>
                          <span>$0.00</span>
                        </div>
                      ) : null}
                      <div className="restaurant-cart-totals-row">
                        <span>Tax (9.25%)</span>
                        <span>${money(taxAmount)}</span>
                      </div>
                      <div className="restaurant-cart-totals-row total">
                        <span>Total</span>
                        <span>${money(orderTotal)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="restaurant-btn-checkout-lg"
                      onClick={handleCheckout}
                      disabled={cart.length === 0}
                    >
                      Checkout
                    </button>
                    {cart.length > 0 ? (
                      <button
                        type="button"
                        className="restaurant-link-clear"
                        onClick={clearCart}
                      >
                        Clear cart
                      </button>
                    ) : null}
                  </>
                )}

                <button
                  type="button"
                  className="restaurant-link-continue"
                  onClick={scrollToMenu}
                >
                  Continue shopping
                </button>
              </>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
