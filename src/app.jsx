import React, { useState, useEffect, useId, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import EVENT from '../firebase-functions/event-config.json';
import { validatePersonalisation } from '../firebase-functions/personalisation';
import StaffScreen from './staff';
import { createRequestId } from './request-id';

// ─────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = {
    "style": "nuvei",
    "accent": EVENT.theme.signalBlue,
    "showInventory": false,
    "eventName": EVENT.name,
    "venue": "",
    "lowStock": 20
  };

// Configuration
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  // Airtable credentials stay in the server-side order service.
  CONTACT_FORM_URL: 'https://airtable.com/appdvB1aUSC8Q0Z2T/pagDaSkn5Er5Lcuuq/form',
};

async function airtableRequest(action, payload = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch('/api/redemptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(json.error || 'Request failed');
      error.status = res.status;
      error.code = json.code;
      throw error;
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function submitToAirtable(fields, requestId) {
  return airtableRequest('create-redemption', {
    requestId,
    redemption: {
      name: fields.Name,
      company: fields.Company,
      email: fields.Email,
      phone: fields.Phone,
      gift: fields.Gift,
      decoration: fields.Decoration,
      ...(fields.DecorationBottom !== undefined ? { decorationBottom: fields.DecorationBottom } : {}),
      font: fields.Font,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// iOS Frame components
// ─────────────────────────────────────────────────────────────

function IOSStatusBar({ dark = false, time = '9:41' }) {
  const c = dark ? '#fff' : '#000';
  return (
    <div style={{
      display: 'flex', gap: 154, alignItems: 'center', justifyContent: 'center',
      padding: '21px 24px 19px', boxSizing: 'border-box',
      position: 'relative', zIndex: 20, width: '100%',
    }}>
      <div style={{ flex: 1, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 1.5 }}>
        <span style={{ fontFamily: '-apple-system, "SF Pro", system-ui', fontWeight: 590, fontSize: 17, lineHeight: '22px', color: c }}>
          {time}
        </span>
      </div>
      <div style={{ flex: 1, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 1, paddingRight: 1 }}>
        <svg width="19" height="12" viewBox="0 0 19 12">
          <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c}/>
          <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c}/>
          <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c}/>
          <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c}/>
        </svg>
        <svg width="17" height="12" viewBox="0 0 17 12">
          <path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z" fill={c}/>
          <path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z" fill={c}/>
          <circle cx="8.5" cy="10.5" r="1.5" fill={c}/>
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={c} strokeOpacity="0.35" fill="none"/>
          <rect x="2" y="2" width="20" height="9" rx="2" fill={c}/>
          <path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill={c} fillOpacity="0.4"/>
        </svg>
      </div>
    </div>
  );
}

function IOSGlassPill({ children, dark = false, style = {} }) {
  return (
    <div style={{
      height: 44, minWidth: 44, borderRadius: 9999,
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: dark
        ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)'
        : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 9999,
        backdropFilter: 'blur(12px) saturate(180%)',
        WebkitBackdropFilter: 'blur(12px) saturate(180%)',
        background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 9999,
        boxShadow: dark
          ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)'
          : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
        border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', padding: '0 4px' }}>
        {children}
      </div>
    </div>
  );
}

function IOSDevice({ children, width = 402, height = 874, dark = false }) {
  return (
    <div style={{
      width, height, borderRadius: 48, overflow: 'hidden',
      position: 'relative', background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* dynamic island */}
      <div style={{
        position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
        width: 126, height: 37, borderRadius: 24, background: '#000', zIndex: 50,
      }} />
      {/* status bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <IOSStatusBar dark={dark} />
      </div>
      {/* content */}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
      </div>
      {/* home indicator */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
        height: 34, display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        paddingBottom: 8, pointerEvents: 'none',
      }}>
        <div style={{
          width: 139, height: 5, borderRadius: 100,
          background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)',
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Notification Banner
// ─────────────────────────────────────────────────────────────

function NotificationBanner({ notif, onDismiss }) {
  if (!notif) return null;
  const isEmail = notif.channel === 'email';
  return (
    <div style={{
      position: 'absolute', top: 12, left: 10, right: 10, zIndex: 100,
      background: 'rgba(28,28,30,0.88)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      borderRadius: 22, padding: '12px 14px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      border: '0.5px solid rgba(255,255,255,0.12)',
      display: 'flex', gap: 10, alignItems: 'flex-start',
      animation: 'banner-in .45s cubic-bezier(.2,.7,.3,1.2)',
    }} onClick={onDismiss}>
      <div style={{
        width: 38, height: 38, borderRadius: 9,
        background: isEmail ? '#0a84ff' : '#34c759',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {isEmail ? (
          <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
            <rect x="1" y="1" width="18" height="14" rx="2" stroke="#fff" strokeWidth="1.6"/>
            <path d="M1 3l9 6 9-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 4a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 3v-3H5a2 2 0 01-2-2V4z" fill="#fff"/>
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <div style={{ fontFamily: '-apple-system, system-ui', fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: -0.08 }}>
            {isEmail ? 'Mail' : 'Messages'}
          </div>
          <div style={{ fontFamily: '-apple-system, system-ui', fontSize: 12, color: 'rgba(235,235,245,0.6)' }}>now</div>
        </div>
        <div style={{ fontFamily: '-apple-system, system-ui', fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: -0.15, marginBottom: 2 }}>
          {notif.title}
        </div>
        <div style={{
          fontFamily: '-apple-system, system-ui', fontSize: 14, lineHeight: 1.3,
          color: 'rgba(235,235,245,0.85)', letterSpacing: -0.15,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        }}>{notif.body}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared screen primitives
// ─────────────────────────────────────────────────────────────

function Tag({ children, style = {} }) {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
      textTransform: 'uppercase', color: 'var(--accent-text)',
      padding: '5px 8px', border: '1px solid var(--accent)',
      borderRadius: 3, ...style,
    }}>{children}</span>
  );
}

function Btn({ children, onClick, disabled, variant = 'primary', style = {} }) {
  const base = {
    width: '100%', height: 54, borderRadius: 999, border: 'none',
    fontFamily: 'var(--display)', fontWeight: 600, fontSize: 15,
    letterSpacing: 0.6, textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform .12s ease, opacity .12s ease',
    opacity: disabled ? 0.4 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  };
  const variants = {
    primary: { background: 'var(--accent)', color: 'var(--button-fg, #0a0a0a)' },
    ghost:   { background: 'transparent', color: 'var(--fg)', border: '1px solid var(--line)' },
    dark:    { background: 'var(--fg)', color: 'var(--bg)' },
  };
  return (
    <button disabled={disabled} onClick={onClick}
      onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'scale(0.98)')}
      onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function Field({ label, name, value, onChange, placeholder, type = 'text', hint, hintError, optional, maxLength, rightAdornment, autoComplete, inputMode }) {
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <label htmlFor={inputId} style={{
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.5,
          textTransform: 'uppercase', color: 'var(--fg-dim)',
        }}>
          {label} {optional && <span style={{ opacity: 0.55 }}>— optional</span>}
        </label>
        {maxLength && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <div style={{
        position: 'relative',
        borderBottom: `1px solid ${focused ? 'var(--accent)' : 'var(--line)'}`,
        transition: 'border-color .2s',
      }}>
        <input
          id={inputId} name={name}
          type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} maxLength={maxLength}
          required={!optional} autoComplete={autoComplete} inputMode={inputMode}
          aria-invalid={hintError || undefined}
          aria-describedby={hint ? hintId : undefined}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: '100%', border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--fg)', fontFamily: 'var(--display)', fontSize: 18, fontWeight: 500,
            padding: '8px 0', letterSpacing: -0.1,
          }}
        />
        {rightAdornment && <div style={{ position: 'absolute', right: 0, top: 8 }}>{rightAdornment}</div>}
      </div>
      {hint && (
        <div id={hintId} role={hintError ? 'alert' : undefined} style={{ marginTop: 6, fontFamily: 'var(--body)', fontSize: 12, color: hintError ? 'var(--accent-text)' : 'var(--fg-dim)' }}>{hint}</div>
      )}
    </div>
  );
}

function StepHeader({ step, total, title, subtitle, onBack }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        {onBack ? (
          <button onClick={onBack} style={{
            background: 'transparent', border: 'none', color: 'var(--fg)',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.5,
            textTransform: 'uppercase', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>← Back</button>
        ) : <div />}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.5, color: 'var(--fg-dim)' }}>
          {String(step).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </div>
      </div>
      <h1 tabIndex="-1" style={{
        fontFamily: 'var(--display)', fontSize: 34, fontWeight: 700,
        lineHeight: 1.02, letterSpacing: -1.2, color: 'var(--fg)', margin: '0 0 10px',
      }}>{title}</h1>
      {subtitle && (
        <div style={{ fontFamily: 'var(--body)', fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.5, marginBottom: 30 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function ProgressPips({ step, total }) {
  return (
    <div role="progressbar" aria-label="Personalisation progress" aria-valuemin="0" aria-valuemax={total} aria-valuenow={step} style={{ display: 'flex', gap: 4, padding: '0 24px 14px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 2,
          background: i < step ? 'var(--accent)' : 'var(--line)',
          transition: 'background .3s',
        }} />
      ))}
    </div>
  );
}

function ConsentRow() {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontFamily: 'var(--body)', fontSize: 11, lineHeight: 1.45, color: 'var(--fg-dim)', fontStyle: 'italic' }}>
        By continuing, you agree to be contacted by The Gift Expert regarding this experience and related offerings. Unsubscribe anytime.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Gift illustrations
// ─────────────────────────────────────────────────────────────

function GiftIllustration({ type, name = '', bottomName = '', compact = false, stickerImg = null, font }) {
  const configuredProduct = EVENT.products.find(product => product.id === type);
  if (configuredProduct) {
    return (
      <div style={{ height: '100%', background: '#FAF9F8', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: name ? '26px 12px 30px' : 4, boxSizing: 'border-box' }}>
        {name ? (
          <svg viewBox="30 100 880 1370" role="img" aria-label={`Retouched adaptor photo preview: ${name} at the top, ${bottomName || 'bottom text'} at the bottom`} style={{ width: '100%', height: '100%', maxHeight: 290 }}>
            <image href="/images/nuvei-adaptor-studio.png" x="0" y="0" width="941" height="1672" />
            <text x="470" y="350" textAnchor="middle" fill="#d9d9d9" style={{ fontFamily: font?.css, fontSize: 70 }}>{name}</text>
            <text x="470" y="1230" textAnchor="middle" fill="#d9d9d9" style={{ fontFamily: font?.css, fontSize: 70 }}>{bottomName || 'Alex'}</text>
          </svg>
        ) : (
          <img src={configuredProduct.image} alt="Black Nuvei travel adaptor reference" style={{ width: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        )}
        {name && <div style={{ fontSize: 11, color: '#555', textAlign: 'center', marginTop: 6 }}>Product preview · Top and bottom engraving</div>}
      </div>
    );
  }
  // ── IMAGE PATHS ──────────────────────────────────────────────
  // Save your images into an `images/` folder in the same repo:
  //   images/tumbler.webp  ← Coffee Tumbler
  //   images/notebook.webp ← Notebook
  //   images/card.webp     ← NETS Prepaid Card
  const imgs = {
    mug:      '/images/tumbler.webp',
    notebook: '/images/notebook.webp',
    card:     '/images/card.webp',
  };
  // Show decoration label only for text personalisation (not sticker IDs)
  const showLabel = name && !name.startsWith('sticker-');

  // Tumbler: engraving overlay — centered on cup body, debossed look
  const engravingOverlay = showLabel && type === 'mug' && (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: 400,
      letterSpacing: 0, textTransform: 'uppercase',
      color: 'rgba(185,180,175,0.82)',
      textShadow: '0 -1px 0 rgba(255,255,255,0.18), 0 2px 4px rgba(0,0,0,0.95)',
      pointerEvents: 'none', whiteSpace: 'nowrap',
      mixBlendMode: 'screen',
    }}>
      {name.toUpperCase()}
    </div>
  );

  // NETS card: name left-aligned under "CLUB MEMBER", starting at the 'R'
  const barOverlay = showLabel && type !== 'mug' && (
    <div style={{
      position: 'absolute', top: '62%', left: 0,
      width: '36%', textAlign: 'right',
      fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: 400,
      color: '#e1d7b1', letterSpacing: 1,
      textTransform: 'uppercase', pointerEvents: 'none',
    }}>
      {name.toUpperCase()}
    </div>
  );

  // Notebook: sticker overlay — lower-left area per reference image
  const stickerOverlay = stickerImg && type === 'notebook' && (
    <div style={{
      position: 'absolute', top: '66%', left: '44%',
      transform: 'translate(-50%, -50%)',
      width: '18%', pointerEvents: 'none',
    }}>
      <img src={stickerImg} alt="sticker" style={{ width: '100%', objectFit: 'contain', display: 'block' }} />
    </div>
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#fff', overflow: 'hidden' }}>
      <img
        src={imgs[type]}
        alt={type}
        style={{ width: '100%', height: '100%', objectFit: compact ? 'cover' : 'contain', display: 'block' }}
      />
      {engravingOverlay}
      {stickerOverlay}
      {barOverlay}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screens
// ─────────────────────────────────────────────────────────────

function WelcomeScreen({ onStart, eventName, venue, lineCopy, mobile }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      boxSizing: 'border-box', padding: mobile ? '24px 20px 20px' : '40px 24px 24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: 0.35, pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          <Tag>Live</Tag>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <h1 tabIndex="-1" style={{
          fontFamily: 'var(--display)', fontSize: 56, fontWeight: 800,
          lineHeight: 0.92, letterSpacing: -2.5, color: 'var(--fg)', textTransform: 'uppercase', margin: 0, outline: 'none',
        }}>
          Live<br/>
          <span style={{ color: 'var(--accent-text)', fontStyle: 'italic', fontWeight: 500 }}>custom.</span><br/>
          Booth.
        </h1>
        <div style={{
          marginTop: 16, fontFamily: 'var(--mono)', fontSize: 10,
          letterSpacing: 2, textTransform: 'uppercase', color: 'var(--fg)',
        }}>
          {EVENT.brand} · {EVENT.dateLabel}
        </div>
        <div style={{ marginTop: 22, fontFamily: 'var(--body)', fontSize: 15, color: 'var(--fg-dim)', lineHeight: 1.5, maxWidth: 320 }}>
          {lineCopy}
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 18, fontFamily: 'var(--mono)', fontSize: 10,
          letterSpacing: 1.5, color: 'var(--fg-dim)', textTransform: 'uppercase',
        }}>
          <span>// {eventName}</span>
        </div>
        <Btn onClick={onStart}>Start →</Btn>
        <div style={{
          marginTop: 14, textAlign: 'center',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: 1.2,
        }}>
          One per guest · Collect on-site
        </div>
      </div>
    </div>
  );
}

function DetailsScreen({ data, setData, onNext, onBack, mobile }) {
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
  const validPhone = /^\+65[89]\d{7}$/.test(data.phone.replace(/[\s-]/g, ''));
  const valid =
    data.name.trim().length > 0 &&
    data.company.trim().length > 0 &&
    validEmail &&
    validPhone;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: mobile ? '24px 20px 20px' : '40px 24px 24px' }}>
      <StepHeader
        step={1} total={4} onBack={onBack}
        title="Your details."
        subtitle="Enter your details for your personalised gift."
      />
      <div style={{ flex: 1, overflowY: 'auto', margin: mobile ? '0 -20px' : '0 -24px', padding: mobile ? '0 20px 20px' : '0 24px 20px' }}>
        <Field label="Full name" name="name" autoComplete="name" maxLength={100} value={data.name} onChange={v => setData({ ...data, name: v })} placeholder="Jane Tan"/>
        <Field label="Company" name="company" autoComplete="organization" maxLength={100} value={data.company} onChange={v => setData({ ...data, company: v })} placeholder="Your company"/>
        <Field
          label="Company email" name="email" autoComplete="email" inputMode="email"
          value={data.email} onChange={v => setData({ ...data, email: v })}
          placeholder="you@company.com" type="email" maxLength={254}
          hint="One redemption per email address. This is checked when you confirm."
        />
        <Field
          label="Mobile" name="phone" autoComplete="tel" inputMode="tel"
          value={data.phone} onChange={v => setData({ ...data, phone: v })}
          placeholder="+65 9123 4567" type="tel"
          hint={data.phone && !validPhone ? 'Enter a valid SG mobile number, e.g. +6591234567' : 'Contact number for your order.'}
        />
        <ConsentRow />
      </div>
      <Btn onClick={onNext} disabled={!valid} style={{ flexShrink: 0 }}>
        Next →
      </Btn>
    </div>
  );
}

function GiftCard({ gift, selected, onSelect, showInventory }) {
  const out = gift.remaining === 0;
  const unknown = !Number.isSafeInteger(gift.remaining);
  return (
    <button
      onClick={() => !out && !unknown && onSelect(gift.id)}
      disabled={out || unknown}
      aria-pressed={selected}
      aria-label={`${gift.name}. ${unknown ? 'Checking stock' : out ? 'Sold out' : 'Available to personalise'}`}
      style={{
        width: '100%', textAlign: 'left', padding: 0, cursor: out ? 'not-allowed' : 'pointer',
        background: 'var(--surface)', borderRadius: 18,
        border: selected ? '2px solid var(--accent)' : '1px solid var(--line)',
        transition: 'border-color .15s',
        marginBottom: 12, opacity: out ? 0.4 : 1, display: 'block',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', overflow: 'hidden', borderRadius: 16 }}>
        <div style={{ width: 120, height: 100, flexShrink: 0, background: gift.id === 'card' ? '#fff' : 'var(--surface-2)', padding: gift.id === 'card' ? 14 : 0, boxSizing: 'border-box' }}>
          <GiftIllustration type={gift.id} />
        </div>
        <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.5,
              color: selected ? 'var(--accent-text)' : 'var(--fg-dim)', textTransform: 'uppercase', marginBottom: 4,
            }}>{gift.code}</div>
            <div style={{ fontFamily: 'var(--body)', fontSize: 18, fontWeight: 600, color: 'var(--fg)', letterSpacing: 'normal', fontVariant: 'normal' }}>
              {gift.name}
            </div>
            <div style={{ fontFamily: 'var(--body)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>{gift.blurb}</div>
          </div>
          {showInventory && (
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase',
              color: out ? '#ff4d4d' : 'var(--fg-dim)', marginTop: 6,
            }}>
              {unknown ? 'Checking stock…' : out ? '◆ Sold out' : `${gift.remaining} available`}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function GiftPickerScreen({ gifts, selected, setSelected, onNext, onBack, showInventory, mobile, inventoryError, onRefresh }) {
  const px = mobile ? 20 : 24;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: mobile ? `24px ${px}px 20px` : `40px ${px}px 24px` }}>
      <StepHeader step={2} total={4} onBack={onBack} title="Your gift." subtitle={gifts.length === 1 ? 'Personalise your event gift.' : `Choose from ${gifts.length} event gifts.`}/>
      {inventoryError && <div role="alert" style={{ marginBottom: 16 }}>{inventoryError}<button onClick={onRefresh}>Check again</button></div>}
      <div style={{ flex: 1, overflowY: 'auto', margin: `0 -${px}px`, padding: `0 ${px}px` }}>
        {gifts.map(g => (
          <GiftCard key={g.id} gift={g} selected={selected === g.id} onSelect={setSelected} showInventory={showInventory}/>
        ))}
      </div>
      <Btn onClick={onNext} disabled={!selected || !(gifts.find(gift => gift.id === selected)?.remaining > 0)}>Next →</Btn>
    </div>
  );
}

function StickerPicker({ stickers, value, onChange }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8, marginBottom: 16,
    }}>
      {stickers.map(s => {
        const selected = value === s.id;
        return (
          /* padding-bottom: 100% trick guarantees square on all browsers/mobile */
          <div key={s.id} style={{
            position: 'relative', paddingBottom: '100%',
            borderRadius: 10,
            boxShadow: selected ? '0 0 0 2.5px var(--accent)' : '0 0 0 1px var(--line)',
            transition: 'box-shadow .15s',
          }}>
            <button onClick={() => onChange(s.id)} aria-pressed={selected} aria-label={`Letter ${s.name}`} style={{
              position: 'absolute', inset: 0,
              padding: 0, border: 'none', background: 'none', cursor: 'pointer',
              borderRadius: 10, overflow: 'hidden',
              width: '100%', height: '100%',
            }}>
              <div style={{
                width: '100%', height: '100%', background: 'var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {s.img
                  ? <img src={s.img} style={{ width: '80%', height: '80%', objectFit: 'contain' }} alt={s.name} />
                  : <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{s.name}</span>
                }
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PersonaliseScreen({ gift, personalisation, setPersonalisation, bottomPersonalisation, setBottomPersonalisation, fontId, setFontId, onNext, onBack, submitting, submitError, mobile }) {
  const MAX = gift.personalisation.maxLetters;
  const selectedFont = gift.personalisation.fonts.find(font => font.id === fontId);
  const topValid = !!validatePersonalisation(gift, personalisation, fontId);
  const bottomValid = !!validatePersonalisation(gift, bottomPersonalisation, fontId);
  const valid = topValid && bottomValid;
  const isSticker = !!gift.stickers;
  const selectedSticker = isSticker ? (gift.stickers.find(s => s.id === personalisation) || null) : null;
  const px = mobile ? 20 : 24;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: mobile ? `24px ${px}px 16px` : `40px ${px}px 16px` }}>
        <StepHeader step={3} total={4} onBack={onBack} title="Make it yours."
          subtitle={`Top and bottom of the front socket face. Up to ${MAX} letters per area.`}/>
        <div style={{
          background: 'var(--surface-2)', borderRadius: 18, aspectRatio: '5/4',
          marginBottom: 22, position: 'relative', overflow: 'hidden',
        }}>
          <GiftIllustration
            type={gift.id}
            name={isSticker ? '' : (personalisation || gift.samplePlaceholder)}
            bottomName={bottomPersonalisation || 'Alex'}
            stickerImg={selectedSticker?.img || null}
            font={selectedFont}
          />
          <div style={{
            position: 'absolute', top: 12, left: 14,
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.5, color: 'var(--fg-dim)', textTransform: 'uppercase',
          }}>
            Placement preview · {gift.name}
          </div>
          <div style={{
            position: 'absolute', bottom: 10, right: 14,
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.2, color: 'var(--fg-dim)',
          }}>
            TEXT PLACEMENT IS APPROXIMATE
          </div>
        </div>

        {isSticker ? (
          <StickerPicker stickers={gift.stickers} value={personalisation} onChange={setPersonalisation} />
        ) : (
          <><Field
            label="Top engraving" name="decoration" autoComplete="off" value={personalisation}
            onChange={setPersonalisation}
            placeholder="e.g. Jane" maxLength={MAX}
            hint={`Maximum ${MAX} letters. No spaces, numbers or symbols. Uppercase and lowercase are preserved.`}
            hintError={personalisation.length > 0 && !topValid}
          />
          <Field
            label="Bottom engraving" name="decoration-bottom" autoComplete="off" value={bottomPersonalisation}
            onChange={setBottomPersonalisation} placeholder="e.g. Alex" maxLength={MAX}
            hint={`Maximum ${MAX} letters in the bottom area. No spaces, numbers or symbols.`}
            hintError={bottomPersonalisation.length > 0 && !bottomValid}
          /></>
        )}
        <fieldset style={{ border: 0, padding: 0, margin: '8px 0 16px' }}>
          <legend style={{ fontSize: 13, marginBottom: 10 }}>Engraving font · both areas</legend>
          {gift.personalisation.fonts.map(font => (
            <label key={font.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', fontFamily: font.css }}>
              <input type="radio" name="engraving-font" value={font.id} checked={fontId === font.id} onChange={() => setFontId(font.id)} />
              {font.name}
            </label>
          ))}
          <p style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Font preview may vary by device. Final engraving follows the selected font.</p>
        </fieldset>
      </div>

      {/* Sticky Confirm at bottom */}
      <div style={{ padding: `12px ${px}px ${mobile ? 20 : 24}px`, borderTop: '1px solid var(--line)' }}>
        {submitError && (
          <div role="alert" aria-live="assertive" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--error)', letterSpacing: 1.2, marginBottom: 10, textAlign: 'center' }}>
            {submitError}
          </div>
        )}
        <Btn onClick={onNext} disabled={!valid || submitting}>
          {submitting ? 'Submitting…' : 'Confirm →'}
        </Btn>
      </div>
    </div>
  );
}

function TicketRow({ k, v, highlight, smallCaps }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.5, color: 'var(--fg-dim)', textTransform: 'uppercase' }}>{k}</div>
      <div style={{
        fontFamily: 'var(--display)',
        fontSize: highlight ? 16 : 14, fontWeight: highlight ? 700 : 500,
        letterSpacing: -0.2,
        color: highlight ? 'var(--accent-text)' : 'var(--fg)',
        textAlign: 'right',
        fontVariant: smallCaps ? 'small-caps' : 'normal',
      }}>{v}</div>
    </div>
  );
}

function TicketScreen({ ticket, gift, personalisation, bottomPersonalisation, fontId, data, onCollect, mobile, trackingToken }) {
  const [status, setStatus] = useState('Queued');
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let stopped = false;
    let pending = false;
    const refresh = async () => {
      if (pending || !trackingToken) return;
      pending = true;
      try {
        const result = await airtableRequest('get-order-status', { trackingToken });
        if (!stopped) { setStatus(result.status); setOffline(false); }
      } catch { if (!stopped) setOffline(true); }
      finally { pending = false; }
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => { stopped = true; clearInterval(interval); };
  }, [trackingToken]);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', boxSizing: 'border-box', padding: mobile ? '24px 20px 20px' : '40px 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, flexShrink: 0 }}>
        <Tag>Ticket</Tag>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.5, color: 'var(--fg-dim)' }}>04 / 04</div>
      </div>

      <div style={{
        background: 'var(--surface)', borderRadius: 22, flexShrink: 0,
        border: '1px solid var(--line)', padding: 24,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.5,
          color: 'var(--fg-dim)', textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', marginBottom: 18,
        }}>
          <span>Powered by The Gift Expert</span>
        </div>
        <h1 tabIndex="-1" style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace', fontSize: mobile ? 22 : 25, fontWeight: 600,
          lineHeight: 1.4, letterSpacing: 'normal', fontVariantLigatures: 'none', overflowWrap: 'anywhere', color: 'var(--fg)', margin: '0 0 8px', outline: 'none',
        }}>{ticket}</h1>
        <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--fg-dim)', marginBottom: 22 }}>
          Order reference · Save this screen for collection.
        </div>
        <div style={{ borderTop: '1px dashed var(--line)', margin: '0 -24px 20px' }} />
        <TicketRow k="Gift" v={gift.name} />
        <TicketRow k="Top" v={(gift.stickers
          ? (gift.stickers.find(s => s.id === personalisation)?.name ?? personalisation)
          : personalisation) || '—'} highlight />
        <TicketRow k="Bottom" v={bottomPersonalisation || '—'} highlight />
        <TicketRow k="Font" v={gift.personalisation.fonts.find(font => font.id === fontId)?.name} />
        <TicketRow k="For" v={data.name} />
        <TicketRow k="Contact" v={data.phone} />
      </div>

      <div role="status" aria-live="polite" style={{
        marginTop: 20, padding: '18px 20px', flexShrink: 0,
        background: 'var(--surface)', color: 'var(--fg)',
        borderRadius: 14, border: '1px solid var(--line)',
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.7, marginBottom: 4 }}>Status</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>
          {{ Queued: 'Order received', Decorating: 'Engraving in progress', Ready: 'Ready for collection', Collected: 'Collected' }[status] || 'Order received'}
        </div>
        <div style={{ marginTop: 4, fontFamily: 'var(--body)', fontSize: 13, opacity: 0.75 }}>
          {offline ? 'Cannot refresh status. Your order is saved; ask the event team for updates.' : 'Show your order reference to the event team. Status refreshes automatically while this screen is open.'}
        </div>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ flexShrink: 0, marginTop: 16 }}><Btn onClick={onCollect} variant="dark">I've saved my reference ✓</Btn></div>
    </div>
  );
}

function DoneScreen({ onRestart, data, gift, personalisation, bottomPersonalisation, mobile }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: mobile ? '24px 20px 20px' : '40px 24px 24px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Tag style={{ alignSelf: 'flex-start', marginBottom: 24 }}>Order received</Tag>
        <h1 tabIndex="-1" style={{
          fontFamily: 'var(--display)', fontSize: 48, fontWeight: 800,
          lineHeight: 0.95, letterSpacing: -2, color: 'var(--fg)', textTransform: 'uppercase', margin: '0 0 18px', outline: 'none',
        }}>
          Thanks,<br/>
          <span style={{ color: 'var(--accent-text)', fontStyle: 'italic', fontWeight: 500, textTransform: 'none' }}>
            {data.name.split(' ')[0]}.
          </span>
        </h1>
        <div style={{ fontFamily: 'var(--body)', fontSize: 15, color: 'var(--fg-dim)', lineHeight: 1.5, marginBottom: 12 }}>
          Your order for a <b style={{ color: 'var(--fg)' }}>{gift.name}</b>, personalised with <b style={{ color: 'var(--fg)' }}>{personalisation}</b> at the top and <b style={{ color: 'var(--fg)' }}>{bottomPersonalisation}</b> at the bottom, has been saved. Please check with the event team before collecting.
        </div>
        <div style={{ fontFamily: 'var(--body)', fontSize: 15, color: 'var(--fg-dim)', lineHeight: 1.5, marginBottom: 30 }}>
          Show it off. Tag{' '}
          <a href="https://www.instagram.com/thegiftexpert_sg/" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--fg)', fontWeight: 600, textDecoration: 'none', borderBottom: '1px solid var(--accent)' }}>
            @thegiftexpert_sg
          </a>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, border: '1px solid var(--line)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: 'var(--fg)', letterSpacing: -0.2, marginBottom: 8 }}>
            Bring the TGE Live Experience to your next event.
          </div>
          <a href={CONFIG.CONTACT_FORM_URL} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.2, color: 'var(--accent-text)', textDecoration: 'none', textTransform: 'uppercase' }}>
            Get in Touch →
          </a>
        </div>
      </div>
      <Btn onClick={onRestart} variant="ghost">Back to start</Btn>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tweaks panel
// ─────────────────────────────────────────────────────────────

function TweaksPanel({ tweaks, setTweak, visible }) {
  const [open, setOpen] = useState(true);
  if (!visible) return null;

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', background: '#0a0a0a',
    border: '1px solid #2a2a2a', color: '#fff', padding: '7px 9px',
    borderRadius: 4, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', outline: 'none',
  };

  const TSection = ({ label, children }) => (
    <div>
      <div style={{ fontSize: 9, letterSpacing: 1.6, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  );

  const Chips = ({ value, options, onChange }) => (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          fontSize: 10, padding: '5px 9px', borderRadius: 4, cursor: 'pointer',
          background: value === o.v ? '#d4ff3a' : '#1a1a1a',
          color: value === o.v ? '#0a0a0a' : '#ccc',
          border: '1px solid ' + (value === o.v ? '#d4ff3a' : '#2a2a2a'),
          fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.8, textTransform: 'uppercase',
        }}>{o.l}</button>
      ))}
    </div>
  );

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 999,
      width: open ? 300 : 48,
      background: '#111', color: '#fff', borderRadius: 14,
      border: '1px solid #2a2a2a', overflow: 'hidden',
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      transition: 'width .2s',
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', background: '#1a1a1a', border: 'none', color: '#fff',
        padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 11, letterSpacing: 1.5,
        textTransform: 'uppercase', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{open ? 'Tweaks' : '⚙'}</span>
        {open && <span style={{ opacity: 0.5 }}>−</span>}
      </button>
      {open && (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TSection label="Style">
            <Chips value={tweaks.style} options={[
              { v: 'neon', l: 'Neon' }, { v: 'acid', l: 'Acid' },
              { v: 'cream', l: 'Cream' }, { v: 'mono', l: 'Mono' }, { v: 'nuvei', l: 'Nuvei' },
            ]} onChange={v => setTweak({ style: v })} />
          </TSection>
          <TSection label="Accent">
            <div style={{ display: 'flex', gap: 6 }}>
              {[EVENT.theme.signalBlue, EVENT.theme.coreNavy, '#38bedc', '#d4ff3a', '#ffffff'].map(c => (
                <button key={c} onClick={() => setTweak({ accent: c })} style={{
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                  background: c, border: tweaks.accent === c ? '2px solid #fff' : '1px solid #333',
                }} />
              ))}
            </div>
          </TSection>
          <TSection label="Inventory">
            <Chips value={tweaks.showInventory ? 'on' : 'off'} options={[
              { v: 'on', l: 'Visible' }, { v: 'off', l: 'Hidden' },
            ]} onChange={v => setTweak({ showInventory: v === 'on' })} />
          </TSection>
          <TSection label="Event name">
            <input value={tweaks.eventName} onChange={e => setTweak({ eventName: e.target.value })} style={inputStyle}/>
          </TSection>
          <TSection label="Venue">
            <input value={tweaks.venue} onChange={e => setTweak({ venue: e.target.value })} style={inputStyle}/>
          </TSection>
          <TSection label="Low stock threshold">
            <input type="number" value={tweaks.lowStock} onChange={e => setTweak({ lowStock: Number(e.target.value) })} style={inputStyle}/>
          </TSection>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Initial data
// ─────────────────────────────────────────────────────────────

const INITIAL_GIFTS = EVENT.products;

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────

function App() {
  const [tweaks, setTweaksState] = useState(() => {
    try {
      const saved = localStorage.getItem(`lc.tweaks.${EVENT.id}.official-v1`);
      return saved ? { ...TWEAK_DEFAULTS, ...JSON.parse(saved) } : TWEAK_DEFAULTS;
    } catch { return TWEAK_DEFAULTS; }
  });
  const setTweak = (patch) => {
    const next = { ...tweaks, ...patch };
    setTweaksState(next);
    localStorage.setItem(`lc.tweaks.${EVENT.id}.official-v1`, JSON.stringify(next));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, window.location.origin);
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', tweaks.accent);
    document.documentElement.style.setProperty('--brand-blue', EVENT.theme.signalBlue);
    document.documentElement.style.setProperty('--brand-navy', EVENT.theme.coreNavy);
    document.documentElement.style.setProperty('--brand-white', EVENT.theme.warmWhite);
    document.documentElement.style.setProperty('--brand-grey', EVENT.theme.supportGrey);
  }, [tweaks.accent]);

  const [screenW, setScreenW] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setScreenW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const isPhone = screenW <= 600;

  const [tweaksVisible, setTweaksVisible] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (e.data?.type === '__activate_edit_mode') setTweaksVisible(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksVisible(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, window.location.origin);
    return () => window.removeEventListener('message', handler);
  }, []);

  const [step, setStep] = useState(0);
  const [data, setData] = useState({ name: '', company: '', email: '', phone: '+65' });
  const [selectedGiftId, setSelectedGiftId] = useState(null);
  const [personalisation, setPersonalisation] = useState('');
  const [bottomPersonalisation, setBottomPersonalisation] = useState('');
  const [fontId, setFontId] = useState(EVENT.products[0].personalisation.fonts[0].id);
  const submissionInFlight = useRef(false);
  const retryRequest = useRef(null);
  const [ticket, setTicket] = useState('');
  const [trackingToken, setTrackingToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  useEffect(() => {
    if (selectedGiftId) {
      setPersonalisation(''); // reset when gift changes
      setBottomPersonalisation('');
      setFontId(EVENT.products.find(product => product.id === selectedGiftId).personalisation.fonts[0].id);
    }
  }, [selectedGiftId]);

  const [inventory, setInventory] = useState({});
  const [inventoryError, setInventoryError] = useState('');
  const inventoryInFlight = useRef(false);
  const refreshInventory = async () => {
    if (inventoryInFlight.current) return;
    inventoryInFlight.current = true;
    try {
      const result = await airtableRequest('get-availability');
      if (!Array.isArray(result.products)) throw new Error('Invalid availability');
      setInventory(Object.fromEntries(result.products.map(product => [product.id, product.remaining])));
      setInventoryError('');
    } catch {
      setInventory({});
      setInventoryError('Stock cannot be checked right now. Please try again or ask the event team.');
    } finally { inventoryInFlight.current = false; }
  };
  useEffect(() => {
    refreshInventory();
    const interval = setInterval(refreshInventory, 30000);
    return () => clearInterval(interval);
  }, []);
  const gifts = INITIAL_GIFTS.map(gift => ({ ...gift, remaining: inventory[gift.id] }));
  const selectedGift = gifts.find(g => g.id === selectedGiftId);

  const go = (s) => setStep(s);
  const restart = () => {
    setData({ name: '', company: '', email: '', phone: '+65' });
    setSelectedGiftId(null);
    setPersonalisation('');
    setBottomPersonalisation('');
    setFontId(EVENT.products[0].personalisation.fonts[0].id);
    setTicket('');
    setTrackingToken('');
    retryRequest.current = null;
    setSubmitError('');
    setStep(0);
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => document.querySelector('.screen h1')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    if (step === 0 || step === 4 || submitting) return;
    const timeoutMs = step === 5 ? 60_000 : 10 * 60_000;
    let timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(restart, timeoutMs);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      clearTimeout(timeout);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [step, submitting]);

  const submitRedemption = async () => {
    const validated = validatePersonalisation(selectedGift, personalisation, fontId);
    const validatedBottom = validatePersonalisation(selectedGift, bottomPersonalisation, fontId);
    if (submissionInFlight.current || !validated || !validatedBottom) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const fields = {
        Name:       data.name,
        Company:    data.company,
        Email:      data.email,
        Phone:      data.phone,
        Gift:       selectedGift.name.toLowerCase(),
        Decoration: validated.decoration,
        DecorationBottom: validatedBottom.decoration,
        Font: fontId,
      };
      const fingerprint = JSON.stringify(fields);
      if (retryRequest.current?.fingerprint !== fingerprint) retryRequest.current = { fingerprint, id: createRequestId() };
      const result = await submitToAirtable(fields, retryRequest.current.id);
      setTicket(result.ticket);
      setTrackingToken(result.trackingToken);
      refreshInventory();
      setPersonalisation(validated.decoration);
      setBottomPersonalisation(validatedBottom.decoration);
      setStep(4);
    } catch (error) {
      if (error.code === 'sold-out') { setSubmitError('This gift has sold out. Please ask the event team.'); refreshInventory(); }
      else if (error.code === 'duplicate-email') setSubmitError('This email has already been used. Ask the event team to find your order; do not submit another email.');
      else if (error.status === 409) setSubmitError('Your request changed or was already used. Please ask the event team for help.');
      else if (error.status === 429) setSubmitError('The service is busy. Please wait a minute and try again.');
      else if (error.status === 422) setSubmitError('Please check your details and personalisation, then try again.');
      else if (error.name === 'AbortError') setSubmitError('The request timed out. Please check your connection and try again.');
      else setSubmitError('Submission failed. Please check your connection and try again.');
    }
    submissionInFlight.current = false;
    setSubmitting(false);
  };

  const screenMap = {
    0: <WelcomeScreen
          eventName={tweaks.eventName} venue={tweaks.venue}
          lineCopy={<>Personalise the top and bottom of your Nuvei travel adaptor with up to five letters per area. Choose an engraving font and collect on-site with <em>The Gift Expert</em>.</>}
          onStart={() => go(1)} mobile={isPhone} />,
    1: <DetailsScreen data={data} setData={setData} onNext={() => go(2)} onBack={() => go(0)} mobile={isPhone} />,
    2: <GiftPickerScreen gifts={gifts} selected={selectedGiftId} setSelected={setSelectedGiftId}
          inventoryError={inventoryError} onRefresh={refreshInventory}
          showInventory={tweaks.showInventory} onNext={() => go(3)} onBack={() => go(1)} mobile={isPhone} />,
    3: <PersonaliseScreen gift={selectedGift} personalisation={personalisation}
          bottomPersonalisation={bottomPersonalisation} setBottomPersonalisation={setBottomPersonalisation}
          fontId={fontId} setFontId={setFontId}
          setPersonalisation={setPersonalisation} onNext={submitRedemption} onBack={() => go(2)}
          submitting={submitting} submitError={submitError} mobile={isPhone} />,
    4: <TicketScreen ticket={ticket} gift={selectedGift} personalisation={personalisation}
          bottomPersonalisation={bottomPersonalisation}
          trackingToken={trackingToken}
          fontId={fontId}
          data={data} onCollect={() => go(5)} mobile={isPhone} />,
    5: <DoneScreen data={data} gift={selectedGift} personalisation={personalisation} bottomPersonalisation={bottomPersonalisation} onRestart={restart} mobile={isPhone} />,
  };

  const showPips = step >= 1 && step <= 3;

  const label = `0${step+1} ${['Welcome','Details','Gift','Personalise','Ticket','Done'][step]}`;
  const pips = showPips ? <div style={{ paddingBottom: isPhone ? 16 : 24 }}><ProgressPips step={step} total={4} /></div>
                        : <div style={{ height: isPhone ? 16 : 24, flexShrink: 0 }} />;
  const panels = <TweaksPanel tweaks={tweaks} setTweak={setTweak} visible={tweaksVisible} />;

  return (
    <div data-screen-label={label} className={`style-${tweaks.style}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 10,
        background: isPhone ? 'var(--bg)' : EVENT.theme.coreNavy,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div style={{
        width: '100%',
        maxWidth: isPhone ? undefined : 480,
        height: isPhone ? '100%' : 'min(860px, calc(100% - 48px))',
        background: 'var(--bg)', color: 'var(--fg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRadius: isPhone ? 0 : 24,
        boxShadow: isPhone ? 'none' : '0 32px 80px rgba(0,0,0,0.5)',
      }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div className="screen" key={step} style={{ position: 'absolute', inset: 0 }}>{screenMap[step]}</div>
        </div>
        {pips}
      </div>
      {panels}
    </div>
  );
}

createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('staff') === '1' ? <StaffScreen/> : <App/>);

// Set --app-height for accurate mobile viewport (excludes browser chrome)
function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 100));

// Layout is fully CSS-driven — no scale transform needed
