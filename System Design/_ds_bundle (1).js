/* @ds-bundle: {"format":4,"namespace":"DawahInvitationsDesignSystem_51e74b","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Tabs","sourcePath":"components/core/Tabs.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Tooltip","sourcePath":"components/core/Tooltip.jsx"},{"name":"Funnel","sourcePath":"components/data/Funnel.jsx"},{"name":"Num","sourcePath":"components/data/Num.jsx"},{"name":"Phone","sourcePath":"components/data/Phone.jsx"},{"name":"ProgressBar","sourcePath":"components/data/ProgressBar.jsx"},{"name":"StatCard","sourcePath":"components/data/StatCard.jsx"},{"name":"STATUS","sourcePath":"components/data/StatusPill.jsx"},{"name":"StatusPill","sourcePath":"components/data/StatusPill.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"Timeline","sourcePath":"components/data/Timeline.jsx"},{"name":"Banner","sourcePath":"components/feedback/Banner.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"ChoiceCard","sourcePath":"components/forms/ChoiceCard.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"PhoneInput","sourcePath":"components/forms/PhoneInput.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Stepper","sourcePath":"components/forms/Stepper.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"cf7d81f4799f","components/core/Button.jsx":"ef3496400a0c","components/core/Card.jsx":"836b14e6d7c6","components/core/Icon.jsx":"51e419d220d7","components/core/IconButton.jsx":"f01d896aca19","components/core/Tabs.jsx":"0e05278ab143","components/core/Tag.jsx":"89007ba8fcb1","components/core/Tooltip.jsx":"9b9e8265f70d","components/data/Funnel.jsx":"c8781058c883","components/data/Num.jsx":"04ebb0b8d7c0","components/data/Phone.jsx":"b8caf9e11327","components/data/ProgressBar.jsx":"26cd3029ae0d","components/data/StatCard.jsx":"d0d3982e45cc","components/data/StatusPill.jsx":"83fd79693a0b","components/data/Table.jsx":"a01239bfe93f","components/data/Timeline.jsx":"ce4cdc72e869","components/feedback/Banner.jsx":"389e438787fa","components/feedback/Dialog.jsx":"e822f839dee1","components/feedback/EmptyState.jsx":"74f0dac5be79","components/feedback/Skeleton.jsx":"77fe87a92ac3","components/feedback/Toast.jsx":"431f4c8d0c19","components/forms/Checkbox.jsx":"0a4e909aea2d","components/forms/ChoiceCard.jsx":"b54de22b1e46","components/forms/Field.jsx":"258473d15e29","components/forms/Input.jsx":"b7483f7d719b","components/forms/PhoneInput.jsx":"a1dc4631f679","components/forms/Radio.jsx":"ab3968217912","components/forms/Select.jsx":"a296a8daf8f7","components/forms/Stepper.jsx":"73c0703963f8","components/forms/Switch.jsx":"a12540848a81","ui_kits/guest-invitation/app.screen.jsx":"0ad69fe7e8dc","ui_kits/guest-invitation/invitation.screen.jsx":"5851e3b1be68","ui_kits/host-dashboard/app.screen.jsx":"b3bf529ea577","ui_kits/host-dashboard/data.jsx":"3530e812c66c","ui_kits/host-dashboard/guests.screen.jsx":"cc0274dd9ef5","ui_kits/host-dashboard/overview.screen.jsx":"00e32733ba0d","ui_kits/host-dashboard/reminders.screen.jsx":"0588dda6f491","ui_kits/host-dashboard/sending.screen.jsx":"da95a8d38903","ui_kits/host-dashboard/settings.screen.jsx":"237dc6e366c7","ui_kits/host-dashboard/shell.screen.jsx":"79abcc7cb43f","ui_kits/host-onboarding/onboarding.screen.jsx":"ad9b53654dcc","ui_kits/whatsapp/chat.screen.jsx":"ddee3ac8f354"},"inlinedExternals":[],"unexposedExports":[{"name":"formatNum","sourcePath":"components/data/Num.jsx"},{"name":"formatPercent","sourcePath":"components/data/Num.jsx"},{"name":"inputFrame","sourcePath":"components/forms/Input.jsx"}]} */

(() => {

const __ds_ns = (window.DawahInvitationsDesignSystem_51e74b = window.DawahInvitationsDesignSystem_51e74b || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
const SZ = {
  xs: 24,
  sm: 28,
  md: 36,
  lg: 44,
  xl: 56
};
const initials = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('');
/** Soft bronze-tint disc with initials; pass src for a photo. */
function Avatar({
  name,
  src,
  size = 'md',
  tone = 'soft',
  style
}) {
  const px = SZ[size] || SZ.md;
  const dark = tone === 'dark';
  return /*#__PURE__*/React.createElement("span", {
    role: "img",
    "aria-label": name,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: px,
      height: px,
      flex: 'none',
      borderRadius: 'var(--radius-full)',
      overflow: 'hidden',
      background: dark ? 'var(--ink)' : 'var(--accent-soft)',
      color: dark ? 'var(--text-on-dark)' : 'var(--accent-hover)',
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: Math.round(px * .38),
      lineHeight: 1,
      ...style
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials(name));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** White surface on paper: 1px warm border, 14px radius, whisper shadow. Header optional. */
function Card({
  title,
  subtitle,
  actions,
  footer,
  padding = 'var(--card-pad)',
  tone = 'default',
  interactive = false,
  children,
  style,
  ...rest
}) {
  const tones = {
    default: {
      bg: 'var(--surface-card)',
      bd: 'var(--border-default)'
    },
    sunken: {
      bg: 'var(--surface-sunken)',
      bd: 'transparent'
    },
    accent: {
      bg: 'var(--accent-soft)',
      bd: 'var(--accent-soft-2)'
    },
    dark: {
      bg: 'var(--ink)',
      bd: 'var(--ink)'
    }
  };
  const t = tones[tone] || tones.default;
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      background: t.bg,
      color: tone === 'dark' ? 'var(--text-on-dark)' : 'inherit',
      border: `1px solid ${t.bd}`,
      borderRadius: 'var(--radius-card)',
      boxShadow: tone === 'default' ? 'var(--shadow-card)' : 'none',
      display: 'flex',
      flexDirection: 'column',
      cursor: interactive ? 'pointer' : undefined,
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), title || actions ? /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      padding: `${padding} ${padding} 0`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title ? /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      lineHeight: 1.4
    }
  }, title) : null, subtitle ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 'var(--text-sm)',
      color: tone === 'dark' ? 'rgba(251,249,246,.7)' : 'var(--text-muted)'
    }
  }, subtitle) : null), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flex: 'none'
    }
  }, actions) : null) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding,
      flex: 1
    }
  }, children), footer ? /*#__PURE__*/React.createElement("footer", {
    style: {
      padding: `12px ${padding}`,
      borderTop: `1px solid ${tone === 'dark' ? 'rgba(255,255,255,.12)' : 'var(--border-default)'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12
    }
  }, footer) : null);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useEffect,
  useRef,
  useState
} = React;
const toPascal = s => String(s).split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
/** Lucide icon (loaded from CDN as window.lucide). Directional icons pass flipRtl to mirror inside RTL containers. */
function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  color = 'currentColor',
  label,
  flipRtl = false,
  style,
  ...rest
}) {
  const ref = useRef(null);
  const [rtl, setRtl] = useState(false);
  useEffect(() => {
    if (!flipRtl || !ref.current) return;
    const el = ref.current.closest('[dir]');
    setRtl(!!el && el.getAttribute('dir') === 'rtl');
  }, [flipRtl]);
  const lib = typeof window !== 'undefined' ? window.lucide : null;
  const P = toPascal(name);
  const node = lib ? lib.icons && lib.icons[P] || lib[P] : null;
  const kids = Array.isArray(node) ? node.map(([tag, attrs], i) => React.createElement(tag, {
    ...attrs,
    key: i
  })) : null;
  return /*#__PURE__*/React.createElement("svg", _extends({
    ref: ref,
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    role: label ? 'img' : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    style: {
      flex: 'none',
      display: 'inline-block',
      verticalAlign: 'middle',
      transform: rtl ? 'scaleX(-1)' : undefined,
      ...style
    }
  }, rest), kids);
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const V = {
  primary: {
    bg: 'var(--ink)',
    fg: 'var(--text-on-dark)',
    bd: 'var(--ink)',
    hbg: '#2B261F',
    abg: '#3A342B'
  },
  accent: {
    bg: 'var(--accent)',
    fg: 'var(--text-on-accent)',
    bd: 'var(--accent)',
    hbg: 'var(--accent-hover)',
    abg: '#6A4F2A'
  },
  secondary: {
    bg: 'var(--surface-card)',
    fg: 'var(--text-body)',
    bd: 'var(--border-strong)',
    hbg: 'var(--surface-hover)',
    abg: 'var(--surface-pressed)'
  },
  ghost: {
    bg: 'transparent',
    fg: 'var(--text-secondary)',
    bd: 'transparent',
    hbg: 'var(--surface-hover)',
    abg: 'var(--surface-pressed)'
  },
  danger: {
    bg: 'var(--danger)',
    fg: '#fff',
    bd: 'var(--danger)',
    hbg: '#9A4331',
    abg: '#7F3527'
  },
  'danger-soft': {
    bg: 'var(--danger-bg)',
    fg: 'var(--danger-fg)',
    bd: 'var(--danger-bg)',
    hbg: '#F1D8D2',
    abg: '#EAC9C1'
  },
  whatsapp: {
    bg: 'var(--wa-teal)',
    fg: '#fff',
    bd: 'var(--wa-teal)',
    hbg: '#0F7A6E',
    abg: '#0B6259'
  },
  'guest-primary': {
    bg: 'var(--inv-deep)',
    fg: 'var(--inv-cream)',
    bd: 'var(--inv-deep)',
    hbg: 'var(--inv-deep-2)',
    abg: '#1E1710'
  },
  'guest-secondary': {
    bg: 'transparent',
    fg: 'var(--inv-deep)',
    bd: 'var(--inv-line)',
    hbg: 'rgba(154,118,66,.08)',
    abg: 'rgba(154,118,66,.14)'
  }
};
const S = {
  sm: {
    h: 'var(--control-h-sm)',
    px: 12,
    fs: 'var(--text-sm)',
    gap: 6,
    ic: 16
  },
  md: {
    h: 'var(--control-h-md)',
    px: 16,
    fs: 'var(--text-md)',
    gap: 8,
    ic: 18
  },
  lg: {
    h: 'var(--control-h-lg)',
    px: 20,
    fs: 'var(--text-base)',
    gap: 8,
    ic: 20
  },
  guest: {
    h: 'var(--control-h-guest)',
    px: 24,
    fs: 'var(--text-guest-lg)',
    gap: 12,
    ic: 24
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconEnd,
  loading = false,
  disabled = false,
  fullWidth = false,
  children,
  style,
  ...rest
}) {
  const [hov, setHov] = useState(false);
  const [act, setAct] = useState(false);
  const v = V[variant] || V.primary;
  const s = S[size] || S.md;
  const off = disabled || loading;
  const isGuest = variant.startsWith('guest');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: off,
    "aria-busy": loading || undefined,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => {
      setHov(false);
      setAct(false);
    },
    onMouseDown: () => setAct(true),
    onMouseUp: () => setAct(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      height: s.h,
      padding: `0 ${s.px}px`,
      width: fullWidth ? '100%' : undefined,
      fontFamily: 'var(--font-ui)',
      fontSize: s.fs,
      fontWeight: isGuest ? 600 : 500,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      background: act ? v.abg : hov ? v.hbg : v.bg,
      color: v.fg,
      border: `1px solid ${act || hov ? v.bd === 'transparent' ? 'transparent' : v.bd : v.bd}`,
      borderRadius: isGuest ? 'var(--radius-lg)' : 'var(--radius-control)',
      cursor: off ? 'not-allowed' : 'pointer',
      opacity: off ? .5 : 1,
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "loader-circle",
    size: s.ic,
    style: {
      animation: 'dawah-spin 1s linear infinite'
    }
  }) : icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: s.ic
  }) : null, children ? /*#__PURE__*/React.createElement("span", null, children) : null, iconEnd ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconEnd,
    size: s.ic,
    flipRtl: true
  }) : null, /*#__PURE__*/React.createElement("style", null, '@keyframes dawah-spin{to{transform:rotate(360deg)}}'));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const SZ = {
  sm: 32,
  md: 40,
  lg: 48
};
function IconButton({
  name,
  label,
  variant = 'ghost',
  size = 'md',
  active = false,
  disabled = false,
  flipRtl = false,
  badge,
  style,
  ...rest
}) {
  const [hov, setHov] = useState(false);
  const px = SZ[size] || SZ.md;
  const outline = variant === 'outline';
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    title: label,
    disabled: disabled,
    "aria-pressed": active || undefined,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: px,
      height: px,
      flex: 'none',
      background: active ? 'var(--accent-soft)' : hov ? 'var(--surface-hover)' : outline ? 'var(--surface-card)' : 'transparent',
      color: active ? 'var(--accent-hover)' : 'var(--text-secondary)',
      border: `1px solid ${outline ? 'var(--border-strong)' : 'transparent'}`,
      borderRadius: 'var(--radius-control)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: name,
    size: px >= 48 ? 22 : 18,
    flipRtl: flipRtl
  }), badge != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 6,
      insetInlineEnd: 6,
      minWidth: 8,
      height: 8,
      borderRadius: 999,
      background: 'var(--danger)',
      border: '2px solid var(--surface-card)'
    }
  }) : null);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Tabs.jsx
try { (() => {
/** Status filter tabs. items: [{id,label,count}]. variant underline (page-level) or pill (in-card). */
function Tabs({
  items = [],
  value,
  onChange,
  variant = 'underline',
  style
}) {
  const pill = variant === 'pill';
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: 'flex',
      gap: pill ? 4 : 2,
      borderBottom: pill ? 'none' : '1px solid var(--border-default)',
      padding: pill ? 4 : 0,
      background: pill ? 'var(--surface-sunken)' : 'transparent',
      borderRadius: pill ? 'var(--radius-control)' : 0,
      overflowX: 'auto',
      ...style
    }
  }, items.map(it => {
    const on = it.id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      role: "tab",
      type: "button",
      "aria-selected": on,
      onClick: () => onChange && onChange(it.id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: pill ? 32 : 40,
        padding: pill ? '0 12px' : '0 12px',
        border: 0,
        background: pill && on ? 'var(--surface-card)' : 'transparent',
        color: on ? 'var(--text-body)' : 'var(--text-muted)',
        fontSize: 'var(--text-md)',
        fontWeight: on ? 600 : 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        borderRadius: pill ? 'var(--radius-sm)' : 0,
        boxShadow: pill && on ? 'var(--shadow-card)' : 'none',
        borderBottom: pill ? 'none' : `2px solid ${on ? 'var(--ink)' : 'transparent'}`,
        marginBottom: pill ? 0 : -1,
        transition: 'var(--transition-control)'
      }
    }, it.label, it.count != null ? /*#__PURE__*/React.createElement("span", {
      className: "num",
      style: {
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 999,
        background: on ? 'var(--ink)' : 'var(--surface-sunken)',
        color: on ? 'var(--text-on-dark)' : 'var(--text-muted)'
      }
    }, it.count) : null);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
/** Category/tag chip for guests (e.g. "أهل العروس", "زملاء العمل"). Neutral by default; tone=accent for the active filter. */
function Tag({
  children,
  tone = 'neutral',
  onRemove,
  removeLabel = 'إزالة',
  size = 'md',
  style
}) {
  const tones = {
    neutral: {
      bg: 'var(--surface-sunken)',
      fg: 'var(--text-secondary)',
      bd: 'transparent'
    },
    outline: {
      bg: 'transparent',
      fg: 'var(--text-secondary)',
      bd: 'var(--border-strong)'
    },
    accent: {
      bg: 'var(--accent-soft)',
      fg: 'var(--accent-hover)',
      bd: 'transparent'
    }
  };
  const t = tones[tone] || tones.neutral;
  const h = size === 'sm' ? 22 : 28;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: h,
      padding: `0 ${size === 'sm' ? 8 : 10}px`,
      borderRadius: 'var(--radius-pill)',
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.bd}`,
      fontSize: size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)',
      fontWeight: 500,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style
    }
  }, children, onRemove ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": removeLabel,
    onClick: onRemove,
    style: {
      display: 'inline-flex',
      border: 0,
      background: 'transparent',
      padding: 0,
      marginInlineEnd: -4,
      cursor: 'pointer',
      color: 'inherit',
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 14
  })) : null);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/core/Tooltip.jsx
try { (() => {
const {
  useState
} = React;
/** Dark ink tooltip on hover/focus. placement top|bottom. */
function Tooltip({
  label,
  children,
  placement = 'top',
  open
}) {
  const [hov, setHov] = useState(false);
  const show = open ?? hov;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex'
    },
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    onFocus: () => setHov(true),
    onBlur: () => setHov(false)
  }, children, /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: 'absolute',
      insetInlineStart: '50%',
      transform: 'translateX(-50%)',
      [placement === 'top' ? 'bottom' : 'top']: 'calc(100% + 6px)',
      background: 'var(--ink)',
      color: 'var(--text-on-dark)',
      fontSize: 'var(--text-xs)',
      fontWeight: 500,
      lineHeight: 1.4,
      padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      opacity: show ? 1 : 0,
      transition: 'opacity var(--dur-fast) var(--ease-out)',
      zIndex: 20,
      boxShadow: 'var(--shadow-raised)'
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/data/Num.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Localised number. lang="ar" → Arabic-Indic digits (١٢٣); "en" → Western. Phone numbers must NOT use this — see Phone. */
function formatNum(n, lang = 'ar', opts) {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-arab' : 'en-US', opts).format(Number(n) || 0);
}
function formatPercent(n, lang = 'ar') {
  return formatNum(n, lang) + (lang === 'ar' ? '٪' : '%');
}
function Num({
  value,
  lang = 'ar',
  percent = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: "num",
    style: style
  }, rest), percent ? formatPercent(value, lang) : formatNum(value, lang));
}
Object.assign(__ds_scope, { formatNum, formatPercent, Num });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Num.jsx", error: String((e && e.message) || e) }); }

// components/data/Funnel.jsx
try { (() => {
/** WhatsApp delivery funnel: Sent → Delivered → Read → Responded. steps: [{label, value}]. Bars are relative to the first step; chevrons follow reading direction. */
function Funnel({
  steps = [],
  lang = 'ar',
  style
}) {
  const base = steps[0]?.value || 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      gap: 8,
      ...style
    }
  }, steps.map((s, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)',
      fontWeight: 500
    }
  }, s.label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 'var(--text-2xl)',
      fontWeight: 600,
      lineHeight: 1
    }
  }, __ds_scope.formatNum(s.value, lang)), i > 0 ? /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, __ds_scope.formatPercent(Math.round(s.value / base * 100), lang)) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      borderRadius: 999,
      background: 'var(--surface-sunken)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      height: '100%',
      width: `${Math.min(100, s.value / base * 100)}%`,
      background: i === steps.length - 1 ? 'var(--accepted)' : 'var(--ink)',
      opacity: .35 + .65 * (i + 1) / steps.length
    }
  }))), i < steps.length - 1 ? /*#__PURE__*/React.createElement("span", {
    style: {
      alignSelf: 'center',
      color: 'var(--text-disabled)',
      display: 'inline-flex',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 16,
    flipRtl: true
  })) : null)));
}
Object.assign(__ds_scope, { Funnel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Funnel.jsx", error: String((e && e.message) || e) }); }

// components/data/Phone.jsx
try { (() => {
/** WhatsApp number — always LTR, Western digits, mono, tabular. masked=true hides the middle for users without "view full numbers" permission. */
function Phone({
  value,
  masked = false,
  style
}) {
  const v = String(value || '');
  const shown = masked ? v.replace(/^(\+?\d{3,4})\d+(\d{3})$/, (_, a, b) => `${a} ••• •• ${b}`) : v.replace(/^(\+\d{3})(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3 $4');
  return /*#__PURE__*/React.createElement("span", {
    className: "phone",
    dir: "ltr",
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      ...style
    }
  }, shown);
}
Object.assign(__ds_scope, { Phone });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Phone.jsx", error: String((e && e.message) || e) }); }

// components/data/ProgressBar.jsx
try { (() => {
/** Segmented RSVP progress. segments: [{label, value, tone}] — tone is a status token name (accepted/partial/declined/pending/notsent). Legend always shows label + percent + count. */
function ProgressBar({
  segments = [],
  total,
  lang = 'ar',
  height = 10,
  legend = true,
  style
}) {
  const sum = total || segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "img",
    "aria-label": segments.map(s => `${s.label} ${__ds_scope.formatPercent(Math.round(s.value / sum * 100), lang)}`).join(', '),
    style: {
      display: 'flex',
      height,
      borderRadius: 'var(--radius-pill)',
      overflow: 'hidden',
      background: 'var(--surface-sunken)',
      gap: 2
    }
  }, segments.map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      width: `${s.value / sum * 100}%`,
      background: `var(--${s.tone || 'notsent'})`,
      transition: 'width var(--dur-slow) var(--ease-out)'
    }
  }))), legend ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px 20px'
    }
  }, segments.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 'var(--text-sm)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      width: 10,
      height: 10,
      borderRadius: 3,
      background: `var(--${s.tone || 'notsent'})`
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)'
    }
  }, s.label), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontWeight: 600
    }
  }, __ds_scope.formatPercent(Math.round(s.value / sum * 100), lang)), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      color: 'var(--text-muted)'
    }
  }, "(", __ds_scope.formatNum(s.value, lang), ")")))) : null);
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/data/StatCard.jsx
try { (() => {
const {
  useState
} = React;
/** Overview metric. `context` disambiguates the unit ("مجموعة دعوات", "شخص متوقع") — required by the counting rule. tone colours a small dot, never the number. */
function StatCard({
  label,
  value,
  context,
  footnote,
  tone,
  icon,
  lang = 'ar',
  onClick,
  size = 'md',
  style
}) {
  const [hov, setHov] = useState(false);
  const big = size === 'lg';
  return /*#__PURE__*/React.createElement("div", {
    role: onClick ? 'button' : undefined,
    tabIndex: onClick ? 0 : undefined,
    onClick: onClick,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: big ? 24 : 18,
      background: 'var(--surface-card)',
      border: `1px solid ${hov && onClick ? 'var(--border-strong)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-card)',
      boxShadow: 'var(--shadow-card)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'var(--transition-control)',
      minWidth: 0,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      color: 'var(--text-muted)',
      fontSize: 'var(--text-sm)',
      fontWeight: 500
    }
  }, tone ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: `var(--${tone})`,
      flex: 'none'
    }
  }) : icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16
  }) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, label), onClick ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "arrow-left",
    size: 14,
    flipRtl: true,
    style: {
      opacity: hov ? 1 : 0,
      transition: 'opacity var(--dur-fast)'
    }
  }) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: big ? 'var(--text-4xl)' : 'var(--text-3xl)',
      fontWeight: 600,
      lineHeight: 1.1,
      letterSpacing: 'var(--tracking-tight)'
    }
  }, typeof value === 'number' ? __ds_scope.formatNum(value, lang) : value), context ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)'
    }
  }, context) : null), footnote ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, footnote) : null);
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/data/StatusPill.jsx
try { (() => {
/** Every status = tone + icon + text. Three separate vocabularies; never mix RSVP and delivery in one pill. */
const STATUS = {
  rsvp: {
    'not-sent': {
      tone: 'notsent',
      icon: 'circle-dashed',
      ar: 'لم تُرسل',
      en: 'Not sent'
    },
    pending: {
      tone: 'pending',
      icon: 'clock',
      ar: 'بانتظار الرد',
      en: 'Pending'
    },
    accepted: {
      tone: 'accepted',
      icon: 'circle-check',
      ar: 'تم القبول',
      en: 'Accepted'
    },
    partial: {
      tone: 'partial',
      icon: 'circle-dot',
      ar: 'قبول جزئي',
      en: 'Partially accepted'
    },
    declined: {
      tone: 'declined',
      icon: 'circle-x',
      ar: 'اعتذار',
      en: 'Declined'
    }
  },
  delivery: {
    draft: {
      tone: 'notsent',
      icon: 'file-text',
      ar: 'مسودة',
      en: 'Draft'
    },
    ready: {
      tone: 'notsent',
      icon: 'circle-dashed',
      ar: 'جاهزة',
      en: 'Ready'
    },
    queued: {
      tone: 'pending',
      icon: 'clock',
      ar: 'في الانتظار',
      en: 'Queued'
    },
    sent: {
      tone: 'notsent',
      icon: 'check',
      ar: 'أُرسلت',
      en: 'Sent'
    },
    delivered: {
      tone: 'partial',
      icon: 'check-check',
      ar: 'تم التوصيل',
      en: 'Delivered'
    },
    read: {
      tone: 'checkedin',
      icon: 'eye',
      ar: 'تمت القراءة',
      en: 'Read'
    },
    responded: {
      tone: 'accepted',
      icon: 'reply',
      ar: 'تم الرد',
      en: 'Responded'
    },
    failed: {
      tone: 'failed',
      icon: 'circle-alert',
      ar: 'فشل الإرسال',
      en: 'Failed'
    },
    cancelled: {
      tone: 'notsent',
      icon: 'ban',
      ar: 'أُلغيت',
      en: 'Cancelled'
    }
  },
  checkin: {
    'not-arrived': {
      tone: 'notsent',
      icon: 'circle-dashed',
      ar: 'لم يصل',
      en: 'Not arrived'
    },
    partial: {
      tone: 'partial',
      icon: 'users',
      ar: 'وصول جزئي',
      en: 'Partially checked in'
    },
    'checked-in': {
      tone: 'checkedin',
      icon: 'badge-check',
      ar: 'تم الدخول',
      en: 'Checked in'
    },
    'already-scanned': {
      tone: 'pending',
      icon: 'triangle-alert',
      ar: 'مُسح مسبقًا',
      en: 'Already scanned'
    }
  },
  event: {
    upcoming: {
      tone: 'notsent',
      icon: 'calendar',
      ar: 'قادمة',
      en: 'Upcoming'
    },
    sending: {
      tone: 'pending',
      icon: 'send',
      ar: 'جارٍ الإرسال',
      en: 'Sending'
    },
    'rsvp-open': {
      tone: 'accepted',
      icon: 'mail-open',
      ar: 'الردود مفتوحة',
      en: 'RSVP open'
    },
    'rsvp-closed': {
      tone: 'partial',
      icon: 'lock',
      ar: 'الردود مغلقة',
      en: 'RSVP closed'
    },
    today: {
      tone: 'checkedin',
      icon: 'sparkles',
      ar: 'اليوم',
      en: 'Today'
    },
    completed: {
      tone: 'notsent',
      icon: 'check',
      ar: 'منتهية',
      en: 'Completed'
    },
    archived: {
      tone: 'notsent',
      icon: 'archive',
      ar: 'مؤرشفة',
      en: 'Archived'
    }
  }
};
function StatusPill({
  kind = 'rsvp',
  status,
  lang = 'ar',
  label,
  detail,
  size = 'md',
  variant = 'soft',
  style
}) {
  const d = (STATUS[kind] || {})[status] || {
    tone: 'notsent',
    icon: 'circle',
    ar: status,
    en: status
  };
  const t = d.tone;
  const soft = variant === 'soft';
  const h = size === 'sm' ? 22 : 26;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: h,
      padding: `0 ${size === 'sm' ? 7 : 9}px`,
      borderRadius: 'var(--radius-pill)',
      whiteSpace: 'nowrap',
      background: soft ? `var(--${t}-bg)` : 'transparent',
      color: `var(--${t}-fg)`,
      fontSize: size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)',
      fontWeight: 500,
      lineHeight: 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: d.icon,
    size: size === 'sm' ? 13 : 14,
    color: `var(--${t})`,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement("span", null, label || d[lang] || d.ar), detail ? /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      opacity: .8,
      fontWeight: 400
    }
  }, "\xB7 ", detail) : null);
}
Object.assign(__ds_scope, { STATUS, StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/data/Timeline.jsx
try { (() => {
/** Vertical event list for delivery timelines and activity history. items: [{label, time, tone, icon, meta}]. tone = status token; last item may be `pending` (hollow dot). */
function Timeline({
  items = [],
  dense = false,
  style
}) {
  return /*#__PURE__*/React.createElement("ol", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, items.map((it, i) => {
    const last = i === items.length - 1;
    const c = it.tone ? `var(--${it.tone})` : 'var(--line-strong)';
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      style: {
        display: 'flex',
        gap: 12,
        position: 'relative',
        paddingBottom: last ? 0 : dense ? 12 : 18
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 'none',
        width: 20
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": true,
      style: {
        width: it.icon ? 20 : 10,
        height: it.icon ? 20 : 10,
        marginTop: it.icon ? 0 : 5,
        borderRadius: '50%',
        background: it.hollow ? 'var(--surface-card)' : c,
        border: it.hollow ? `2px solid ${c}` : 'none',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, it.icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 12,
      strokeWidth: 2.5
    }) : null), !last ? /*#__PURE__*/React.createElement("span", {
      "aria-hidden": true,
      style: {
        flex: 1,
        width: 2,
        background: 'var(--border-default)',
        marginTop: 4
      }
    }) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-md)',
        fontWeight: it.strong ? 600 : 500,
        lineHeight: 1.4,
        color: it.hollow ? 'var(--text-muted)' : 'var(--text-body)'
      }
    }, it.label), it.meta ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-sm)',
        color: 'var(--text-muted)',
        marginTop: 2
      }
    }, it.meta) : null), it.time ? /*#__PURE__*/React.createElement("span", {
      className: "num",
      style: {
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap'
      }
    }, it.time) : null));
  }));
}
Object.assign(__ds_scope, { Timeline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Timeline.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Banner.jsx
try { (() => {
const K = {
  danger: {
    ic: 'circle-alert',
    c: 'var(--danger)',
    bg: 'var(--danger-bg)',
    fg: 'var(--danger-fg)'
  },
  warning: {
    ic: 'clock',
    c: 'var(--warning)',
    bg: 'var(--warning-bg)',
    fg: 'var(--warning-fg)'
  },
  info: {
    ic: 'info',
    c: 'var(--info)',
    bg: 'var(--info-bg)',
    fg: 'var(--info-fg)'
  },
  success: {
    ic: 'circle-check',
    c: 'var(--success)',
    bg: 'var(--success-bg)',
    fg: 'var(--success-fg)'
  },
  neutral: {
    ic: 'info',
    c: 'var(--text-muted)',
    bg: 'var(--surface-sunken)',
    fg: 'var(--text-secondary)'
  }
};
/** Actionable attention card ("٣ رسائل فشل إرسالها → مراجعة"). Every banner leads somewhere: actionLabel is required in practice. */
function Banner({
  kind = 'info',
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
  style
}) {
  const k = K[kind] || K.info;
  return /*#__PURE__*/React.createElement("div", {
    role: kind === 'danger' ? 'alert' : 'status',
    style: {
      display: 'flex',
      alignItems: compact ? 'center' : 'flex-start',
      gap: 12,
      padding: compact ? '10px 14px' : '14px 16px',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-card)',
      boxShadow: 'var(--shadow-card)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-md)',
      background: k.bg,
      color: k.c,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || k.ic,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-md)',
      fontWeight: 600,
      lineHeight: 1.4
    }
  }, title), description && !compact ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 2,
      lineHeight: 1.5
    }
  }, description) : null), actionLabel || secondaryLabel ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flex: 'none',
      alignItems: 'center'
    }
  }, secondaryLabel ? /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    size: "sm",
    onClick: onSecondary
  }, secondaryLabel) : null, actionLabel ? /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    size: "sm",
    iconEnd: "arrow-left",
    onClick: onAction
  }, actionLabel) : null) : null);
}
Object.assign(__ds_scope, { Banner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Banner.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
/** Modal dialog. `inline` renders the panel without the fixed scrim (for specimens/embedding). danger=true for destructive confirmations. */
function Dialog({
  open = true,
  title,
  description,
  children,
  actions,
  onClose,
  closeLabel = 'إغلاق',
  danger = false,
  width = 480,
  inline = false,
  style
}) {
  if (!open) return null;
  const panel = /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": !inline,
    "aria-labelledby": "dawah-dialog-title",
    style: {
      width: '100%',
      maxWidth: width,
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-dialog)',
      boxShadow: inline ? 'var(--shadow-raised)' : 'var(--shadow-overlay)',
      border: '1px solid var(--border-default)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      padding: '20px 20px 0'
    }
  }, danger ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'var(--danger-bg)',
      color: 'var(--danger-fg)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "triangle-alert",
    size: 20
  })) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h2", {
    id: "dawah-dialog-title",
    style: {
      margin: 0,
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      lineHeight: 1.35
    }
  }, title), description ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: 'var(--text-md)',
      color: 'var(--text-secondary)',
      lineHeight: 1.55
    }
  }, description) : null), onClose ? /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    name: "x",
    label: closeLabel,
    size: "sm",
    onClick: onClose
  }) : null), children ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px 0'
    }
  }, children) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      padding: 20
    }
  }, actions) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: 20
    }
  }));
  if (inline) return panel;
  return /*#__PURE__*/React.createElement("div", {
    onClick: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    },
    style: {
      position: 'fixed',
      inset: 0,
      background: 'var(--scrim)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      zIndex: 100
    }
  }, panel);
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/** Empty / error / permission-restricted state. kind changes the icon disc tone only — copy explains what to do next. */
function EmptyState({
  icon = 'inbox',
  kind = 'empty',
  title,
  description,
  action,
  secondary,
  compact = false,
  style
}) {
  const tone = {
    empty: {
      bg: 'var(--surface-sunken)',
      c: 'var(--text-muted)'
    },
    error: {
      bg: 'var(--danger-bg)',
      c: 'var(--danger)'
    },
    locked: {
      bg: 'var(--warning-bg)',
      c: 'var(--warning)'
    },
    success: {
      bg: 'var(--success-bg)',
      c: 'var(--success)'
    }
  }[kind] || {};
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: compact ? '24px 16px' : '48px 24px',
      gap: 6,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: compact ? 44 : 56,
      height: compact ? 44 : 56,
      borderRadius: '50%',
      background: tone.bg,
      color: tone.c,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: kind === 'error' ? 'circle-alert' : kind === 'locked' ? 'lock' : icon,
    size: compact ? 20 : 24
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: compact ? 'var(--text-md)' : 'var(--text-lg)',
      fontWeight: 600
    }
  }, title), description ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: 380,
      fontSize: 'var(--text-md)',
      color: 'var(--text-secondary)',
      lineHeight: 1.6
    }
  }, description) : null, action || secondary ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 14
    }
  }, secondary, action) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
/** Loading placeholder block. Use rows of Skeleton in tables/cards; never a spinner for page content. */
function Skeleton({
  width = '100%',
  height = 14,
  radius = 'var(--radius-sm)',
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      display: 'block',
      width,
      height,
      borderRadius: radius,
      background: 'linear-gradient(90deg,var(--surface-sunken) 25%,var(--surface-pressed) 50%,var(--surface-sunken) 75%)',
      backgroundSize: '400% 100%',
      animation: 'dawah-shimmer 1.4s ease-in-out infinite',
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes dawah-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}'));
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const K = {
  success: {
    ic: 'circle-check',
    c: 'var(--success)'
  },
  error: {
    ic: 'circle-alert',
    c: 'var(--danger)'
  },
  warning: {
    ic: 'triangle-alert',
    c: 'var(--warning)'
  },
  info: {
    ic: 'info',
    c: 'var(--info)'
  }
};
/** Transient confirmation ("تم إرسال ٢٩ دعوة"). Dark ink surface, icon colour carries kind; text always names the outcome. */
function Toast({
  kind = 'success',
  title,
  description,
  action,
  onDismiss,
  dismissLabel = 'إغلاق',
  style
}) {
  const k = K[kind] || K.info;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      width: 380,
      maxWidth: '100%',
      padding: '12px 14px',
      background: 'var(--ink)',
      color: 'var(--text-on-dark)',
      borderRadius: 'var(--radius-card)',
      boxShadow: 'var(--shadow-overlay)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: k.ic,
    size: 20,
    color: k.c,
    style: {
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-md)',
      fontWeight: 600,
      lineHeight: 1.4
    }
  }, title), description ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'rgba(251,249,246,.72)',
      marginTop: 2,
      lineHeight: 1.5
    }
  }, description) : null, action ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, action) : null), onDismiss ? /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    name: "x",
    label: dismissLabel,
    size: "sm",
    onClick: onDismiss,
    style: {
      color: 'rgba(251,249,246,.7)',
      margin: '-6px -6px -6px 0'
    }
  }) : null);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
/** Checkbox with label. size="guest" = 28px box + 17px text for family-member selection on the guest page. */
function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  style
}) {
  const guest = size === 'guest';
  const box = guest ? 28 : 20;
  const on = checked || indeterminate;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: description ? 'flex-start' : 'center',
      gap: guest ? 14 : 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      minHeight: guest ? 'var(--touch-min)' : undefined,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    "aria-checked": indeterminate ? 'mixed' : checked,
    style: {
      position: 'absolute',
      inset: 0,
      opacity: 0,
      margin: 0,
      width: '100%',
      height: '100%',
      cursor: 'inherit'
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      width: box,
      height: box,
      borderRadius: guest ? 8 : 'var(--radius-sm)',
      border: `${guest ? 2 : 1.5}px solid ${on ? guest ? 'var(--inv-deep)' : 'var(--ink)' : 'var(--border-strong)'}`,
      background: on ? guest ? 'var(--inv-deep)' : 'var(--ink)' : 'var(--surface-card)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      transition: 'var(--transition-control)'
    }
  }, indeterminate ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "minus",
    size: guest ? 18 : 14,
    strokeWidth: 2.5
  }) : checked ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: guest ? 18 : 14,
    strokeWidth: 2.5
  }) : null)), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: guest ? 'var(--text-guest-body)' : 'var(--text-md)',
      fontWeight: guest ? 500 : 400,
      lineHeight: 1.4
    }
  }, label), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, description) : null) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
const {
  useState
} = React;
/** Data table for guest lists. columns: [{key, header, width, align, render(row)}]. Selectable rows use the row key; header checkbox toggles all. Text aligns to reading start; numbers use align:'end'. */
function Table({
  columns = [],
  rows = [],
  rowKey = 'id',
  selectable = false,
  selected = [],
  onSelect,
  onRowClick,
  dense = false,
  emptyState,
  selectAllLabel = 'تحديد الكل',
  style
}) {
  const [hov, setHov] = useState(null);
  const allOn = rows.length > 0 && rows.every(r => selected.includes(r[rowKey]));
  const someOn = !allOn && rows.some(r => selected.includes(r[rowKey]));
  const toggleAll = () => onSelect && onSelect(allOn ? [] : rows.map(r => r[rowKey]));
  const toggle = id => onSelect && onSelect(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const pad = dense ? '8px 12px' : '12px 14px';
  const th = {
    textAlign: 'start',
    padding: pad,
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--surface-sunken)',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-card)',
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-card)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
      fontSize: 'var(--text-md)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, selectable ? /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      width: 44
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Checkbox, {
    checked: allOn,
    indeterminate: someOn,
    onChange: toggleAll
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)'
    }
  }, selectAllLabel)) : null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      ...th,
      width: c.width,
      textAlign: c.align || 'start'
    }
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, rows.length === 0 && emptyState ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length + (selectable ? 1 : 0),
    style: {
      padding: 0
    }
  }, emptyState)) : null, rows.map((r, i) => {
    const id = r[rowKey];
    const on = selected.includes(id);
    return /*#__PURE__*/React.createElement("tr", {
      key: id ?? i,
      onClick: onRowClick ? () => onRowClick(r) : undefined,
      onMouseEnter: () => setHov(id),
      onMouseLeave: () => setHov(null),
      style: {
        background: on ? 'var(--accent-soft)' : hov === id ? 'var(--surface-hover)' : 'transparent',
        cursor: onRowClick ? 'pointer' : 'default',
        transition: 'background-color var(--dur-fast)'
      }
    }, selectable ? /*#__PURE__*/React.createElement("td", {
      onClick: e => e.stopPropagation(),
      style: {
        padding: pad,
        borderBottom: i < rows.length - 1 ? '1px solid var(--border-default)' : 'none',
        width: 44
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Checkbox, {
      checked: on,
      onChange: () => toggle(id)
    })) : null, columns.map(c => /*#__PURE__*/React.createElement("td", {
      key: c.key,
      style: {
        padding: pad,
        borderBottom: i < rows.length - 1 ? '1px solid var(--border-default)' : 'none',
        textAlign: c.align || 'start',
        verticalAlign: 'middle',
        whiteSpace: c.wrap ? 'normal' : 'nowrap'
      }
    }, c.render ? c.render(r) : r[c.key])));
  }))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/forms/ChoiceCard.jsx
try { (() => {
const {
  useState
} = React;
/** Large selectable option card — invitation type picker (host) and "Me only / Me + 1 / Me + 2" (guest). Selection is shown by border + check icon, never colour alone. */
function ChoiceCard({
  selected = false,
  title,
  description,
  icon,
  meta,
  onClick,
  size = 'md',
  disabled = false,
  style
}) {
  const [hov, setHov] = useState(false);
  const guest = size === 'guest';
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "radio",
    "aria-checked": selected,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      width: '100%',
      textAlign: 'start',
      padding: guest ? '16px 18px' : '14px 16px',
      minHeight: guest ? 64 : 56,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      fontFamily: 'inherit',
      background: selected ? guest ? 'rgba(154,118,66,.10)' : 'var(--accent-soft)' : hov ? 'var(--surface-hover)' : guest ? 'transparent' : 'var(--surface-card)',
      border: `${selected ? 2 : 1}px solid ${selected ? guest ? 'var(--inv-deep)' : 'var(--ink)' : guest ? 'var(--inv-line)' : 'var(--border-strong)'}`,
      borderRadius: guest ? 'var(--radius-lg)' : 'var(--radius-card)',
      transition: 'var(--transition-control)',
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-md)',
      background: selected ? 'var(--ink)' : 'var(--surface-sunken)',
      color: selected ? 'var(--text-on-dark)' : 'var(--text-secondary)',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 20
  })) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: guest ? 'var(--text-guest-lg)' : 'var(--text-base)',
      fontWeight: 600,
      lineHeight: 1.3
    }
  }, title), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: guest ? 'var(--text-base)' : 'var(--text-sm)',
      color: 'var(--text-secondary)',
      lineHeight: 1.45
    }
  }, description) : null), meta ? /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)',
      flex: 'none'
    }
  }, meta) : null, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      flex: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: selected ? guest ? 'var(--inv-deep)' : 'var(--ink)' : 'transparent',
      border: selected ? 'none' : '1.5px solid var(--border-strong)',
      color: '#fff'
    }
  }, selected ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14,
    strokeWidth: 3
  }) : null));
}
Object.assign(__ds_scope, { ChoiceCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/ChoiceCard.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
/** Label + control + hint/error wrapper. Errors are text (icon-free) in danger colour. */
function Field({
  label,
  hint,
  error,
  required = false,
  optionalLabel,
  htmlFor,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-body)',
      display: 'flex',
      gap: 6,
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", null, label), required ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      color: 'var(--danger)'
    }
  }, "*") : optionalLabel ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      color: 'var(--text-muted)'
    }
  }, optionalLabel) : null) : null, children, error ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    style: {
      margin: 0,
      fontSize: 'var(--text-sm)',
      color: 'var(--danger-fg)'
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
const H = {
  sm: 'var(--control-h-sm)',
  md: 'var(--control-h-md)',
  lg: 'var(--control-h-lg)',
  guest: 'var(--control-h-guest)'
};
const inputFrame = (focus, invalid, disabled) => ({
  background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
  border: `1px solid ${invalid ? 'var(--danger)' : focus ? 'var(--accent)' : 'var(--border-strong)'}`,
  boxShadow: focus ? invalid ? '0 0 0 3px rgba(181,83,62,.22)' : 'var(--focus-ring)' : 'none',
  borderRadius: 'var(--radius-control)',
  transition: 'var(--transition-control)'
});
/** Text input. dir="ltr" + mono for phone numbers / codes (see PhoneInput). */
function Input({
  size = 'md',
  icon,
  invalid = false,
  disabled = false,
  dir,
  mono = false,
  prefix,
  suffix,
  style,
  inputStyle,
  ...rest
}) {
  const [focus, setFocus] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    dir: dir,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: H[size] || H.md,
      padding: '0 12px',
      color: 'var(--text-body)',
      ...inputFrame(focus, invalid, disabled),
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18,
    color: "var(--text-muted)"
  }) : null, prefix ? /*#__PURE__*/React.createElement("span", {
    className: mono ? 'phone' : undefined,
    style: {
      color: 'var(--text-muted)',
      fontSize: 'var(--text-md)'
    }
  }, prefix) : null, /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    "aria-invalid": invalid || undefined,
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    }
  }, rest, {
    style: {
      flex: 1,
      minWidth: 0,
      border: 0,
      outline: 'none',
      background: 'transparent',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
      fontSize: size === 'guest' ? 'var(--text-guest-body)' : size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)',
      color: 'inherit',
      boxShadow: 'none',
      ...inputStyle
    }
  })), suffix ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 'var(--text-sm)'
    }
  }, suffix) : null);
}
Object.assign(__ds_scope, { inputFrame, Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/PhoneInput.jsx
try { (() => {
/** WhatsApp number input — always LTR, Western digits, mono. Country code is a prefix (default +966). Pass invalid for "not a valid Saudi/GCC number" states. */
function PhoneInput({
  countryCode = '+966',
  value,
  onChange,
  placeholder = '5X XXX XXXX',
  invalid = false,
  disabled = false,
  size = 'md',
  style
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Input, {
    dir: "ltr",
    mono: true,
    size: size,
    prefix: countryCode,
    icon: "phone",
    inputMode: "tel",
    autoComplete: "tel-national",
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    invalid: invalid,
    disabled: disabled,
    style: style
  });
}
Object.assign(__ds_scope, { PhoneInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/PhoneInput.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
/** Radio with label. Group by name. */
function Radio({
  checked = false,
  onChange,
  name,
  value,
  label,
  description,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: description ? 'flex-start' : 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      flex: 'none',
      marginTop: description ? 2 : 0
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    onChange: () => onChange && onChange(value),
    style: {
      position: 'absolute',
      inset: 0,
      opacity: 0,
      margin: 0,
      width: '100%',
      height: '100%',
      cursor: 'inherit'
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      border: `${checked ? 6 : 1.5}px solid ${checked ? 'var(--ink)' : 'var(--border-strong)'}`,
      background: 'var(--surface-card)',
      transition: 'var(--transition-control)'
    }
  })), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      lineHeight: 1.4
    }
  }, label), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, description) : null) : null);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
const {
  useState
} = React;
/** Native select styled as an input. options: [{value,label}] */
function Select({
  options = [],
  value,
  onChange,
  placeholder,
  size = 'md',
  invalid = false,
  disabled = false,
  style
}) {
  const [focus, setFocus] = useState(false);
  const H = {
    sm: 'var(--control-h-sm)',
    md: 'var(--control-h-md)',
    lg: 'var(--control-h-lg)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      height: H[size] || H.md,
      ...__ds_scope.inputFrame(focus, invalid, disabled),
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: value ?? '',
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.value),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      appearance: 'none',
      WebkitAppearance: 'none',
      width: '100%',
      height: '100%',
      border: 0,
      outline: 'none',
      background: 'transparent',
      padding: '0 36px 0 12px',
      paddingInlineStart: 12,
      paddingInlineEnd: 36,
      fontSize: size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)',
      color: value ? 'var(--text-body)' : 'var(--text-muted)',
      boxShadow: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, placeholder ? /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, placeholder) : null, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      insetInlineEnd: 10,
      pointerEvents: 'none',
      display: 'inline-flex',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Stepper.jsx
try { (() => {
/** Numeric stepper for companion counts (0–N). Buttons are 40px hit targets; `size="guest"` = 56px. */
function Stepper({
  value = 0,
  min = 0,
  max = 10,
  onChange,
  size = 'md',
  format,
  decLabel = 'أقل',
  incLabel = 'أكثر',
  style
}) {
  const guest = size === 'guest';
  const h = guest ? 56 : 40;
  const btn = dis => ({
    width: h,
    height: h,
    border: 0,
    background: 'transparent',
    color: dis ? 'var(--text-disabled)' : 'var(--text-body)',
    cursor: dis ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none'
  });
  const set = v => onChange && onChange(Math.min(max, Math.max(min, v)));
  return /*#__PURE__*/React.createElement("div", {
    role: "group",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: h,
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)',
      background: 'var(--surface-card)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": decLabel,
    disabled: value <= min,
    onClick: () => set(value - 1),
    style: btn(value <= min)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "minus",
    size: guest ? 22 : 18
  })), /*#__PURE__*/React.createElement("span", {
    className: "num",
    "aria-live": "polite",
    style: {
      minWidth: guest ? 64 : 44,
      textAlign: 'center',
      fontSize: guest ? 'var(--text-guest-xl)' : 'var(--text-lg)',
      fontWeight: 600,
      borderInline: '1px solid var(--border-default)',
      height: '100%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, format ? format(value) : value), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": incLabel,
    disabled: value >= max,
    onClick: () => set(value + 1),
    style: btn(value >= max)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "plus",
    size: guest ? 22 : 18
  })));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
/** On/off switch (settings, permissions). Knob travels in the reading direction — works natively in RTL. */
function Switch({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-md)',
      fontWeight: 500
    }
  }, label), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, description) : null) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      flex: 'none',
      width: 40,
      height: 24
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    role: "switch",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      inset: 0,
      opacity: 0,
      margin: 0,
      width: '100%',
      height: '100%',
      cursor: 'inherit'
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 999,
      background: checked ? 'var(--accepted)' : 'var(--line-strong)',
      transition: 'var(--transition-control)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      top: 3,
      insetInlineStart: checked ? 19 : 3,
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 1px 2px rgba(23,20,15,.25)',
      transition: 'inset-inline-start var(--dur-base) var(--ease-out)'
    }
  })));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// ui_kits/guest-invitation/app.screen.jsx
try { (() => {
const {
  Tabs,
  Switch,
  Button
} = DS;
function App() {
  const [lang, setLang] = React.useState('ar');
  const [phase, setPhase] = React.useState('open');
  const [qr, setQr] = React.useState(true);
  const ar = lang === 'ar';
  return /*#__PURE__*/React.createElement("div", {
    dir: ar ? 'rtl' : 'ltr'
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar"
  }, /*#__PURE__*/React.createElement(Tabs, {
    variant: "pill",
    value: phase,
    onChange: setPhase,
    items: [{
      id: 'open',
      label: ar ? 'الردود مفتوحة' : 'RSVP open'
    }, {
      id: 'closed',
      label: ar ? 'الردود مغلقة' : 'RSVP closed'
    }, {
      id: 'completed',
      label: ar ? 'بعد المناسبة' : 'Event completed'
    }]
  }), /*#__PURE__*/React.createElement(Switch, {
    checked: qr,
    onChange: setQr,
    label: ar ? 'بطاقة QR' : 'QR pass'
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "languages",
    onClick: () => setLang(ar ? 'en' : 'ar')
  }, ar ? 'English' : 'العربية')), /*#__PURE__*/React.createElement("div", {
    className: "phones"
  }, ['single', 'family', 'companions'].map(type => /*#__PURE__*/React.createElement("div", {
    key: type,
    className: "phone"
  }, /*#__PURE__*/React.createElement(Invitation, {
    key: type + lang + phase,
    type: type,
    lang: lang,
    phase: phase,
    qrEnabled: qr
  })))));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/guest-invitation/app.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/guest-invitation/invitation.screen.jsx
try { (() => {
const DS = window.DawahInvitationsDesignSystem_51e74b;
const {
  Button,
  Checkbox,
  ChoiceCard,
  Icon
} = DS;
const fmt = (n, lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-arab' : 'en-US').format(n);
const G = {
  ar: {
    bismillah: 'بمشيئة الله',
    invite: 'يسرّنا دعوتكم لحضور حفل زواج',
    couple: 'محمد & نورة',
    honor: 'يشرفنا حضوركم ومشاركتنا الفرحة',
    date: 'الخميس ١٤ مايو ٢٠٢٦',
    time: '٨:٣٠ مساءً',
    venue: 'قاعة الماسة',
    city: 'الرياض',
    map: 'فتح الموقع',
    forYou: 'دعوة خاصة لك',
    includes: n => `تشمل هذه الدعوة ${fmt(n, 'ar')} أشخاص`,
    upTo: 'الدعوة لك ولمرافقَين اثنين على الأكثر',
    attend: 'سأحضر',
    decline: 'أعتذر عن الحضور',
    confirmAtt: 'تأكيد الحضور',
    allDecline: 'يعتذر الجميع',
    meOnly: 'أنا فقط',
    mePlus: n => `أنا + ${fmt(n, 'ar')}`,
    selectedOf: (a, b) => `${fmt(a, 'ar')} من ${fmt(b, 'ar')} سيحضرون`,
    confirmed: 'تم تأكيد حضورك',
    people: n => `${fmt(n, 'ar')} ${n === 1 ? 'شخص' : n === 2 ? 'شخصان' : 'أشخاص'}`,
    lookForward: 'نتشرّف بحضوركم',
    declined: 'تم تسجيل اعتذارك',
    thanksDecl: 'شكرًا لإبلاغنا، نتمنى لكم دوام السعادة.',
    change: 'تغيير الرد',
    qr: 'بطاقة الدخول',
    qrHint: 'أظهر هذا الرمز عند المدخل',
    closed: 'انتهت فترة تأكيد الحضور',
    closedNo: 'لم يُسجّل رد. يرجى التواصل مع صاحب المناسبة إذا رغبت بتحديث حضورك.',
    yourResp: 'ردّك المسجّل',
    completed: 'شكرًا لمشاركتنا فرحتنا',
    completedD: 'سُعدنا بحضوركم وبدعواتكم الطيبة.',
    deadline: 'يمكنك تغيير ردّك حتى ١٠ مايو'
  },
  en: {
    bismillah: 'By the grace of God',
    invite: 'We are pleased to invite you to the wedding of',
    couple: 'Mohammed & Noura',
    honor: 'We would be honoured by your presence',
    date: 'Thursday 14 May 2026',
    time: '8:30 PM',
    venue: 'Al Masa Hall',
    city: 'Riyadh',
    map: 'Open location',
    forYou: 'An invitation especially for you',
    includes: n => `This invitation includes ${n} people`,
    upTo: 'For you and up to two companions',
    attend: 'I will attend',
    decline: 'I am unable to attend',
    confirmAtt: 'Confirm attendance',
    allDecline: 'Everyone declines',
    meOnly: 'Me only',
    mePlus: n => `Me + ${n}`,
    selectedOf: (a, b) => `${a} of ${b} attending`,
    confirmed: 'Attendance confirmed',
    people: n => `${n} ${n === 1 ? 'person' : 'people'}`,
    lookForward: 'We look forward to seeing you',
    declined: 'Your apology has been recorded',
    thanksDecl: 'Thank you for letting us know.',
    change: 'Change response',
    qr: 'Entry pass',
    qrHint: 'Show this code at the entrance',
    closed: 'The RSVP period has ended',
    closedNo: 'No response was recorded. Please contact the host if you need to update your attendance.',
    yourResp: 'Your response',
    completed: 'Thank you for sharing our celebration',
    completedD: 'We were delighted to have you with us.',
    deadline: 'You can change your response until 10 May'
  }
};
const GUEST = {
  single: {
    ar: 'سارة القحطاني',
    en: 'Sarah Al-Qahtani'
  },
  family: {
    ar: 'عائلة الدوسري',
    en: 'Al-Dosari family',
    members: {
      ar: ['عبدالله', 'منيرة', 'خالد', 'ريم'],
      en: ['Abdullah', 'Munira', 'Khalid', 'Reem']
    }
  },
  companions: {
    ar: 'محمد العتيبي',
    en: 'Mohammed Al-Otaibi'
  }
};
const Rule = () => /*#__PURE__*/React.createElement("div", {
  "aria-hidden": true,
  style: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    color: 'var(--inv-gold)'
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    width: 48,
    height: 1,
    background: 'var(--inv-line)'
  }
}), /*#__PURE__*/React.createElement(Icon, {
  name: "sparkle",
  size: 12
}), /*#__PURE__*/React.createElement("span", {
  style: {
    width: 48,
    height: 1,
    background: 'var(--inv-line)'
  }
}));
function Invitation({
  type,
  lang,
  phase,
  qrEnabled
}) {
  const g = G[lang];
  const ar = lang === 'ar';
  const guest = GUEST[type];
  const [resp, setResp] = React.useState(null); // null | {count, members?} | 'declined'
  const [sel, setSel] = React.useState([true, true, true, true]);
  const [comp, setComp] = React.useState(null);
  const members = type === 'family' ? guest.members[lang] : [];
  const nSel = sel.filter(Boolean).length;
  const H = ({
    children,
    size = 'var(--text-display-sm)',
    style
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: size,
      lineHeight: 1.35,
      color: 'var(--inv-deep)',
      textAlign: 'center',
      ...style
    }
  }, children);
  const P = ({
    children,
    style
  }) => /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-guest-body)',
      lineHeight: 1.7,
      color: 'var(--inv-deep-2)',
      textAlign: 'center',
      ...style
    }
  }, children);
  const details = /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      borderBlock: '1px solid var(--inv-line)',
      padding: '18px 0'
    }
  }, [['calendar', g.date, g.time], ['map-pin', g.venue, g.city]].map(([ic, a, b]) => /*#__PURE__*/React.createElement("div", {
    key: ic,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 20,
    color: "var(--inv-gold)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      fontWeight: 600,
      color: 'var(--inv-deep)'
    }
  }, a), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: 'var(--inv-deep-2)'
    }
  }, b))));
  const mapBtn = /*#__PURE__*/React.createElement(Button, {
    variant: "guest-secondary",
    size: "guest",
    fullWidth: true,
    icon: "map-pin"
  }, g.map);
  const scope = type === 'single' ? g.forYou : type === 'family' ? g.includes(members.length) : g.upTo;
  const hero = /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      alignItems: 'center',
      padding: '28px 24px 8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      letterSpacing: ar ? 0 : '.16em',
      color: 'var(--inv-gold)',
      fontWeight: 600,
      textTransform: ar ? 'none' : 'uppercase'
    }
  }, g.bismillah), /*#__PURE__*/React.createElement(P, {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-guest-lg)'
    }
  }, g.invite), /*#__PURE__*/React.createElement(H, {
    size: "var(--text-display-md)",
    style: {
      fontFamily: ar ? 'var(--font-display)' : 'var(--font-display-latin)'
    }
  }, g.couple), /*#__PURE__*/React.createElement(Rule, null));
  let body;
  if (phase === 'completed') body = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(H, null, g.completed), /*#__PURE__*/React.createElement(P, null, g.completedD), details);else if (phase === 'closed') body = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--inv-cream-2)',
      borderRadius: 'var(--radius-lg)',
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 22,
    color: "var(--inv-gold)"
  }), /*#__PURE__*/React.createElement(H, {
    size: "var(--text-guest-xl)"
  }, g.closed), type === 'companions' ? /*#__PURE__*/React.createElement(P, null, g.closedNo) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(P, {
    style: {
      fontSize: 15,
      color: 'var(--text-muted)'
    }
  }, g.yourResp), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      gap: 8,
      alignItems: 'center',
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--inv-deep)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: type === 'single' ? 'circle-x' : 'circle-check',
    size: 20,
    color: type === 'single' ? 'var(--declined)' : 'var(--accepted)'
  }), type === 'single' ? g.declined : g.selectedOf(3, 4)))), details, mapBtn);else if (resp === 'declined') body = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      padding: '10px 0 6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'var(--inv-cream-2)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--inv-deep)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 26
  })), /*#__PURE__*/React.createElement(H, {
    size: "var(--text-guest-xl)"
  }, g.declined), /*#__PURE__*/React.createElement(P, null, g.thanksDecl)), /*#__PURE__*/React.createElement(Button, {
    variant: "guest-secondary",
    size: "guest",
    fullWidth: true,
    icon: "pencil-line",
    onClick: () => setResp(null)
  }, g.change), /*#__PURE__*/React.createElement(P, {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, g.deadline));else if (resp) body = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      padding: '6px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'var(--accepted-bg)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--accepted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 28,
    strokeWidth: 2.5
  })), /*#__PURE__*/React.createElement(H, {
    size: "var(--text-guest-xl)"
  }, g.confirmed), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontSize: 40,
      fontFamily: 'var(--font-display)',
      color: 'var(--inv-deep)',
      lineHeight: 1.1
    }
  }, g.people(resp.count)), resp.members ? /*#__PURE__*/React.createElement(P, {
    style: {
      fontSize: 15
    }
  }, resp.members.join(' · ')) : null, /*#__PURE__*/React.createElement(P, {
    style: {
      fontSize: 15,
      color: 'var(--inv-gold)'
    }
  }, g.lookForward)), qrEnabled ? /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 'var(--radius-lg)',
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      border: '1px solid var(--inv-line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--inv-gold)'
    }
  }, g.qr), /*#__PURE__*/React.createElement("div", {
    "aria-label": "QR",
    style: {
      width: 150,
      height: 150,
      borderRadius: 8,
      background: 'repeating-linear-gradient(90deg,var(--inv-deep) 0 8px,transparent 8px 16px),repeating-linear-gradient(0deg,var(--inv-deep) 0 8px,#fff 8px 16px)',
      backgroundBlendMode: 'multiply',
      opacity: .85
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "phone",
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, "INV-2026-0451"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--inv-deep-2)'
    }
  }, g.qrHint)) : null, details, mapBtn, /*#__PURE__*/React.createElement(Button, {
    variant: "guest-secondary",
    size: "guest",
    fullWidth: true,
    icon: "pencil-line",
    onClick: () => setResp(null)
  }, g.change), /*#__PURE__*/React.createElement(P, {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, g.deadline));else body = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-guest-xl)',
      fontWeight: 600,
      color: 'var(--inv-deep)',
      fontFamily: 'var(--font-display)'
    }
  }, guest[lang]), /*#__PURE__*/React.createElement(P, {
    style: {
      fontSize: 16,
      color: 'var(--inv-gold)'
    }
  }, scope)), details, type === 'family' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      background: 'var(--inv-cream-2)',
      borderRadius: 'var(--radius-lg)',
      padding: '10px 18px'
    }
  }, members.map((m, i) => /*#__PURE__*/React.createElement(Checkbox, {
    key: m,
    size: "guest",
    checked: sel[i],
    onChange: v => setSel(sel.map((x, j) => j === i ? v : x)),
    label: m,
    style: {
      padding: '6px 0'
    }
  })), /*#__PURE__*/React.createElement(P, {
    style: {
      fontSize: 15,
      color: 'var(--inv-gold)',
      paddingTop: 4
    }
  }, g.selectedOf(nSel, members.length))) : null, type === 'companions' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, [0, 1, 2].map(n => /*#__PURE__*/React.createElement(ChoiceCard, {
    key: n,
    size: "guest",
    icon: n === 0 ? 'user' : 'users',
    title: n === 0 ? g.meOnly : g.mePlus(n),
    description: g.people(n + 1),
    selected: comp === n,
    onClick: () => setComp(n)
  }))) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 4
    }
  }, type === 'single' ? /*#__PURE__*/React.createElement(Button, {
    variant: "guest-primary",
    size: "guest",
    fullWidth: true,
    icon: "check",
    onClick: () => setResp({
      count: 1
    })
  }, g.attend) : type === 'family' ? /*#__PURE__*/React.createElement(Button, {
    variant: "guest-primary",
    size: "guest",
    fullWidth: true,
    icon: "check",
    disabled: nSel === 0,
    onClick: () => setResp({
      count: nSel,
      members: members.filter((_, i) => sel[i])
    })
  }, g.confirmAtt) : /*#__PURE__*/React.createElement(Button, {
    variant: "guest-primary",
    size: "guest",
    fullWidth: true,
    icon: "check",
    disabled: comp === null,
    onClick: () => setResp({
      count: comp + 1
    })
  }, g.confirmAtt), /*#__PURE__*/React.createElement(Button, {
    variant: "guest-secondary",
    size: "guest",
    fullWidth: true,
    onClick: () => setResp('declined')
  }, type === 'family' ? g.allDecline : g.decline)), mapBtn);
  return /*#__PURE__*/React.createElement("div", {
    dir: ar ? 'rtl' : 'ltr',
    lang: lang,
    className: "screen",
    style: {
      background: 'var(--inv-cream)'
    }
  }, hero, body);
}
Object.assign(window, {
  Invitation,
  DS,
  G
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/guest-invitation/invitation.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-dashboard/app.screen.jsx
try { (() => {
function App() {
  const [lang, setLang] = React.useState('ar');
  const [page, setPage] = React.useState('overview');
  const [eventDay, setEventDay] = React.useState(false);
  const t = T[lang];
  React.useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  const P = {
    overview: Overview,
    guests: Guests,
    sending: Sending,
    reminders: Reminders,
    checkin: Checkin,
    team: Team,
    reports: Reports,
    settings: Settings
  }[page];
  return /*#__PURE__*/React.createElement("div", {
    className: "app",
    dir: lang === 'ar' ? 'rtl' : 'ltr'
  }, /*#__PURE__*/React.createElement(Sidebar, {
    t: t,
    page: page,
    setPage: setPage,
    lang: lang
  }), /*#__PURE__*/React.createElement("div", {
    className: "main"
  }, /*#__PURE__*/React.createElement(Topbar, {
    t: t,
    title: t.nav[page],
    lang: lang,
    setLang: setLang
  }), /*#__PURE__*/React.createElement("div", {
    className: "content",
    key: page + lang
  }, /*#__PURE__*/React.createElement(P, {
    t: t,
    lang: lang,
    setPage: setPage,
    eventDay: eventDay,
    setEventDay: setEventDay
  })), /*#__PURE__*/React.createElement(BottomNav, {
    t: t,
    page: page,
    setPage: setPage
  })));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-dashboard/app.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-dashboard/data.jsx
try { (() => {
const DS = window.DawahInvitationsDesignSystem_51e74b;
const fmt = (n, lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-arab' : 'en-US').format(n);
const T = {
  ar: {
    nav: {
      overview: 'نظرة عامة',
      guests: 'الضيوف',
      sending: 'الدعوات',
      reminders: 'التذكيرات',
      checkin: 'تسجيل الدخول',
      team: 'الفريق',
      reports: 'التقارير',
      settings: 'إعدادات المناسبة'
    },
    event: 'زواج محمد ونورة',
    eventMeta: 'الخميس ١٤ مايو ٢٠٢٦ · ٨:٣٠ م · قاعة الماسة، الرياض',
    switchEvent: 'تبديل المناسبة',
    search: 'ابحث بالاسم أو الرقم أو العائلة',
    notif: 'التنبيهات',
    help: 'المساعدة',
    lang: 'English',
    user: 'خالد العمري',
    role: 'مالك المناسبة',
    credits: 'رصيد الدعوات',
    creditsLeft: '١٥٠ متبقٍ من ٦٠٠',
    groups: 'مجموعات الدعوات',
    named: 'الضيوف المسمّون',
    accepted: 'تم القبول',
    partial: 'قبول جزئي',
    declined: 'اعتذار',
    pending: 'بانتظار الرد',
    notsent: 'لم تُرسل',
    expected: 'المتوقع حضورهم',
    checkedin: 'تم دخولهم',
    group: 'مجموعة',
    person: 'شخص',
    groupsUnit: 'مجموعة',
    peopleUnit: 'شخص',
    rsvpProgress: 'تقدّم الردود',
    funnel: 'مسار واتساب',
    sent: 'أُرسلت',
    delivered: 'تم التوصيل',
    read: 'تمت القراءة',
    responded: 'تم الرد',
    activity: 'آخر النشاطات',
    team: 'الفريق',
    viewAll: 'عرض الكل',
    eventDay: 'وضع يوم المناسبة',
    openCheckin: 'افتح تسجيل الدخول',
    remaining: 'لم يصلوا بعد',
    checkinPct: 'نسبة الدخول',
    arrivals: 'آخر الواصلين',
    att1: '٣ رسائل فشل إرسالها',
    att1d: 'رقم غير صالح أو غير متاح على واتساب.',
    att1a: 'مراجعة الرسائل',
    att2: '٨٩ مجموعة لم تردّ بعد',
    att2a: 'إرسال تذكير',
    att3: 'ينتهي موعد الردود خلال ٣ أيام',
    att3a: 'مراجعة المعلّقين',
    att4: '٢٩ دعوة لم تُرسل بعد',
    att4a: 'إرسال الدعوات',
    tabs: {
      all: 'الكل',
      accepted: 'تم القبول',
      partial: 'قبول جزئي',
      declined: 'اعتذار',
      pending: 'بانتظار الرد',
      'not-sent': 'لم تُرسل',
      failed: 'فشل التوصيل'
    },
    cols: {
      contact: 'جهة الاتصال',
      type: 'نوع الدعوة',
      size: 'حجم الدعوة',
      exp: 'المتوقع',
      delivery: 'واتساب',
      rsvp: 'الرد',
      last: 'آخر نشاط'
    },
    types: {
      single: 'شخص',
      family: 'عائلة',
      companions: 'مرافقون'
    },
    addGuest: 'إضافة ضيف',
    importExcel: 'استيراد Excel',
    filter: 'تصفية',
    export: 'تصدير',
    selected: 'محدد',
    sendInv: 'إرسال الدعوات',
    sendRem: 'إرسال تذكير',
    markRsvp: 'تحديد الرد',
    deleteG: 'حذف',
    more: 'المزيد',
    noResults: 'لا توجد نتائج',
    noResultsD: 'جرّب اسمًا آخر أو أزل التصفية.',
    add: {
      title: 'إضافة ضيف',
      type: 'نوع الدعوة',
      single: 'شخص واحد',
      singleD: 'الدعوة لشخص واحد فقط',
      family: 'عائلة / مجموعة بأسماء',
      familyD: 'رقم واحد، ويختار الضيف من سيحضر بالاسم',
      comp: 'شخص + مرافقون',
      compD: 'دون أسماء المرافقين',
      name: 'اسم الضيف',
      groupName: 'اسم العائلة / المجموعة',
      phone: 'رقم واتساب',
      dup: 'هذا الرقم موجود مسبقًا في هذه المناسبة.',
      members: 'أفراد العائلة',
      addMember: 'إضافة فرد',
      comps: 'عدد المرافقين المسموح',
      tag: 'التصنيف',
      note: 'ملاحظة داخلية',
      optional: 'اختياري',
      draft: 'حفظ كمسودة',
      saveSend: 'حفظ وإرسال الدعوة',
      cancel: 'إلغاء'
    },
    det: {
      identity: 'الهوية',
      invDef: 'تعريف الدعوة',
      rsvp: 'الرد',
      delivery: 'توصيل واتساب',
      history: 'سجل النشاط',
      partySize: 'العدد المؤكد',
      maxComp: 'الحد الأقصى للمرافقين',
      members: 'الأفراد',
      edit: 'تعديل',
      changeRsvp: 'تغيير الرد يدويًا',
      remind: 'تذكير',
      resend: 'إعادة الإرسال',
      copyLink: 'نسخ الرابط',
      openWa: 'فتح واتساب',
      cancelInv: 'إلغاء الدعوة',
      del: 'حذف الضيف',
      lastResp: 'آخر رد'
    }
  },
  en: {
    nav: {
      overview: 'Overview',
      guests: 'Guests',
      sending: 'Invitations',
      reminders: 'Reminders',
      checkin: 'Check-in',
      team: 'Team',
      reports: 'Reports',
      settings: 'Event settings'
    },
    event: 'Mohammed & Noura’s wedding',
    eventMeta: 'Thu 14 May 2026 · 8:30 PM · Al Masa Hall, Riyadh',
    switchEvent: 'Switch event',
    search: 'Search by name, number or family',
    notif: 'Notifications',
    help: 'Help',
    lang: 'العربية',
    user: 'Khalid Al-Omari',
    role: 'Event owner',
    credits: 'Invitation credits',
    creditsLeft: '150 of 600 remaining',
    groups: 'Invitation groups',
    named: 'Named guests',
    accepted: 'Accepted',
    partial: 'Partially accepted',
    declined: 'Declined',
    pending: 'Pending',
    notsent: 'Not sent',
    expected: 'People expected',
    checkedin: 'Checked in',
    group: 'group',
    person: 'person',
    groupsUnit: 'groups',
    peopleUnit: 'people',
    rsvpProgress: 'RSVP progress',
    funnel: 'WhatsApp funnel',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    responded: 'Responded',
    activity: 'Recent activity',
    team: 'Team',
    viewAll: 'View all',
    eventDay: 'Event-day mode',
    openCheckin: 'Open check-in',
    remaining: 'Not arrived',
    checkinPct: 'Check-in progress',
    arrivals: 'Recent arrivals',
    att1: '3 messages failed to send',
    att1d: 'Invalid number or not on WhatsApp.',
    att1a: 'Review failed messages',
    att2: '89 groups have not responded',
    att2a: 'Send reminder',
    att3: 'RSVP deadline in 3 days',
    att3a: 'Review pending guests',
    att4: '29 invitations not sent yet',
    att4a: 'Send invitations',
    tabs: {
      all: 'All',
      accepted: 'Accepted',
      partial: 'Partial',
      declined: 'Declined',
      pending: 'Pending',
      'not-sent': 'Not sent',
      failed: 'Failed delivery'
    },
    cols: {
      contact: 'Contact',
      type: 'Invitation type',
      size: 'Invitation size',
      exp: 'Expected',
      delivery: 'WhatsApp',
      rsvp: 'RSVP',
      last: 'Last activity'
    },
    types: {
      single: 'Person',
      family: 'Family',
      companions: 'Companions'
    },
    addGuest: 'Add guest',
    importExcel: 'Import Excel',
    filter: 'Filter',
    export: 'Export',
    selected: 'selected',
    sendInv: 'Send invitations',
    sendRem: 'Send reminder',
    markRsvp: 'Mark RSVP',
    deleteG: 'Delete',
    more: 'More',
    noResults: 'No results',
    noResultsD: 'Try another name or clear the filter.',
    add: {
      title: 'Add guest',
      type: 'Invitation type',
      single: 'Single person',
      singleD: 'Invitation applies to one person',
      family: 'Named group / family',
      familyD: 'One number; the guest picks who attends by name',
      comp: 'Person + companions',
      compD: 'Companion names not required',
      name: 'Guest name',
      groupName: 'Family / group name',
      phone: 'WhatsApp number',
      dup: 'This WhatsApp number already exists in this event.',
      members: 'Family members',
      addMember: 'Add member',
      comps: 'Companions allowed',
      tag: 'Category',
      note: 'Internal note',
      optional: 'optional',
      draft: 'Save as draft',
      saveSend: 'Save and send invitation',
      cancel: 'Cancel'
    },
    det: {
      identity: 'Identity',
      invDef: 'Invitation definition',
      rsvp: 'RSVP',
      delivery: 'WhatsApp delivery',
      history: 'Activity history',
      partySize: 'Confirmed party',
      maxComp: 'Max companions',
      members: 'Members',
      edit: 'Edit',
      changeRsvp: 'Change RSVP manually',
      remind: 'Remind',
      resend: 'Resend',
      copyLink: 'Copy link',
      openWa: 'Open WhatsApp',
      cancelInv: 'Cancel invitation',
      del: 'Delete guest',
      lastResp: 'Last response'
    }
  }
};
const GUESTS = [{
  id: 1,
  name: {
    ar: 'سارة القحطاني',
    en: 'Sarah Al-Qahtani'
  },
  phone: '+966501234567',
  type: 'single',
  size: 1,
  exp: 1,
  del: 'read',
  rsvp: 'accepted',
  last: {
    ar: 'قبلت · قبل ساعتين',
    en: 'Accepted · 2h ago'
  },
  tag: {
    ar: 'أهل العروس',
    en: 'Bride’s family'
  }
}, {
  id: 2,
  name: {
    ar: 'عائلة الدوسري',
    en: 'Al-Dosari family'
  },
  phone: '+966555555123',
  type: 'family',
  size: 4,
  exp: 3,
  del: 'responded',
  rsvp: 'partial',
  detail: {
    ar: '٣ من ٤',
    en: '3 of 4'
  },
  members: ['عبدالله', 'منيرة', 'خالد', 'ريم'],
  membersEn: ['Abdullah', 'Munira', 'Khalid', 'Reem'],
  attending: [true, true, false, true],
  last: {
    ar: 'قبول جزئي · أمس',
    en: 'Partial · yesterday'
  },
  tag: {
    ar: 'أهل العريس',
    en: 'Groom’s family'
  }
}, {
  id: 3,
  name: {
    ar: 'محمد العتيبي',
    en: 'Mohammed Al-Otaibi'
  },
  phone: '+966533112233',
  type: 'companions',
  size: 3,
  exp: 3,
  del: 'responded',
  rsvp: 'accepted',
  detail: {
    ar: '+٢ مرافقان',
    en: '+2 companions'
  },
  maxComp: 2,
  last: {
    ar: 'قبل مع مرافقَين · ٧:٤٣ م',
    en: 'Accepted +2 · 7:43 PM'
  },
  tag: {
    ar: 'زملاء العمل',
    en: 'Colleagues'
  }
}, {
  id: 4,
  name: {
    ar: 'نواف الحربي',
    en: 'Nawaf Al-Harbi'
  },
  phone: '+966544000999',
  type: 'single',
  size: 1,
  exp: 0,
  del: 'failed',
  rsvp: 'not-sent',
  last: {
    ar: 'فشل الإرسال · قبل ٣ ساعات',
    en: 'Failed · 3h ago'
  },
  tag: {
    ar: 'الأصدقاء',
    en: 'Friends'
  }
}, {
  id: 5,
  name: {
    ar: 'عائلة الشمري',
    en: 'Al-Shammari family'
  },
  phone: '+966566778899',
  type: 'family',
  size: 5,
  exp: 0,
  del: 'delivered',
  rsvp: 'pending',
  members: ['فهد', 'هند', 'سلطان', 'لمى', 'ناصر'],
  membersEn: ['Fahad', 'Hind', 'Sultan', 'Lama', 'Nasser'],
  last: {
    ar: 'تم التوصيل · أمس',
    en: 'Delivered · yesterday'
  },
  tag: {
    ar: 'أهل العريس',
    en: 'Groom’s family'
  }
}, {
  id: 6,
  name: {
    ar: 'ريم المطيري',
    en: 'Reem Al-Mutairi'
  },
  phone: '+966577123456',
  type: 'companions',
  size: 2,
  exp: 0,
  del: 'read',
  rsvp: 'declined',
  maxComp: 1,
  last: {
    ar: 'اعتذرت · قبل يومين',
    en: 'Declined · 2d ago'
  },
  tag: {
    ar: 'أهل العروس',
    en: 'Bride’s family'
  }
}, {
  id: 7,
  name: {
    ar: 'عبدالعزيز الغامدي',
    en: 'Abdulaziz Al-Ghamdi'
  },
  phone: '+966588990011',
  type: 'single',
  size: 1,
  exp: 0,
  del: 'sent',
  rsvp: 'pending',
  last: {
    ar: 'أُرسلت · قبل ٤ ساعات',
    en: 'Sent · 4h ago'
  },
  tag: {
    ar: 'الأصدقاء',
    en: 'Friends'
  }
}, {
  id: 8,
  name: {
    ar: 'عائلة العنزي',
    en: 'Al-Anazi family'
  },
  phone: '+966599001122',
  type: 'family',
  size: 3,
  exp: 3,
  del: 'responded',
  rsvp: 'accepted',
  members: ['سعود', 'نوف', 'يزيد'],
  membersEn: ['Saud', 'Nouf', 'Yazeed'],
  attending: [true, true, true],
  last: {
    ar: 'قبل الجميع · أمس',
    en: 'All accepted · yesterday'
  },
  tag: {
    ar: 'الجيران',
    en: 'Neighbours'
  }
}, {
  id: 9,
  name: {
    ar: 'هند السبيعي',
    en: 'Hind Al-Subaie'
  },
  phone: '+966511223344',
  type: 'single',
  size: 1,
  exp: 0,
  del: 'draft',
  rsvp: 'not-sent',
  last: {
    ar: 'مسودة',
    en: 'Draft'
  },
  tag: {
    ar: 'زملاء العمل',
    en: 'Colleagues'
  }
}];
const STATS = {
  groups: 450,
  named: 620,
  accepted: 280,
  partial: 31,
  declined: 54,
  pending: 58,
  notsent: 27,
  expected: 497,
  checkedin: 212,
  funnel: [423, 410, 388, 334]
};
Object.assign(window, {
  DS,
  T,
  GUESTS,
  STATS,
  fmt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-dashboard/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-dashboard/guests.screen.jsx
try { (() => {
const {
  Tabs,
  Table,
  Button,
  IconButton,
  Input,
  Avatar,
  Phone,
  StatusPill,
  Num,
  Tag,
  Field,
  PhoneInput,
  Select,
  ChoiceCard,
  Stepper,
  Checkbox,
  EmptyState,
  Timeline,
  Card,
  Dialog,
  Toast
} = DS;
function Guests({
  t,
  lang
}) {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [detail, setDetail] = React.useState(null);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const counts = {
    all: 450,
    accepted: 280,
    partial: 31,
    declined: 54,
    pending: 58,
    'not-sent': 27,
    failed: 3
  };
  const rows = GUESTS.filter(g => tab === 'all' || (tab === 'failed' ? g.del === 'failed' : g.rsvp === tab)).filter(g => !q || g.name[lang].includes(q) || g.phone.includes(q.replace(/\s/g, '')));
  const cols = [{
    key: 'name',
    header: t.cols.contact,
    render: g => /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 10,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: g.name[lang],
      size: "sm"
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 500
      }
    }, g.name[lang]), /*#__PURE__*/React.createElement(Phone, {
      value: g.phone
    })))
  }, {
    key: 'type',
    header: t.cols.type,
    render: g => /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 6,
        alignItems: 'center',
        color: 'var(--text-secondary)'
      }
    }, /*#__PURE__*/React.createElement(DS.Icon, {
      name: g.type === 'single' ? 'user' : g.type === 'family' ? 'users' : 'user-plus',
      size: 15
    }), t.types[g.type])
  }, {
    key: 'size',
    header: t.cols.size,
    align: 'end',
    render: g => /*#__PURE__*/React.createElement("span", {
      className: "num"
    }, g.type === 'companions' ? `1+${g.maxComp}` : fmt(g.size, lang))
  }, {
    key: 'exp',
    header: t.cols.exp,
    align: 'end',
    render: g => /*#__PURE__*/React.createElement("span", {
      className: "num",
      style: {
        fontWeight: 600,
        color: g.exp ? 'inherit' : 'var(--text-muted)'
      }
    }, fmt(g.exp, lang))
  }, {
    key: 'del',
    header: t.cols.delivery,
    render: g => /*#__PURE__*/React.createElement(StatusPill, {
      kind: "delivery",
      status: g.del,
      lang: lang,
      size: "sm"
    })
  }, {
    key: 'rsvp',
    header: t.cols.rsvp,
    render: g => /*#__PURE__*/React.createElement(StatusPill, {
      status: g.rsvp,
      lang: lang,
      size: "sm",
      detail: g.detail && g.detail[lang]
    })
  }, {
    key: 'last',
    header: t.cols.last,
    render: g => /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: 'var(--text-muted)'
      }
    }, g.last[lang])
  }, {
    key: 'a',
    header: '',
    align: 'end',
    render: g => /*#__PURE__*/React.createElement(IconButton, {
      name: "ellipsis",
      label: t.more,
      size: "sm",
      onClick: e => {
        e.stopPropagation();
        setDetail(g);
      }
    })
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.nav.guests,
    meta: `${fmt(450, lang)} ${t.groupsUnit} · ${fmt(620, lang)} ${t.named.toLowerCase()} · ${fmt(497, lang)} ${t.expected.toLowerCase()}`
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "upload"
  }, t.importExcel), /*#__PURE__*/React.createElement(Button, {
    icon: "plus",
    onClick: () => setAdding(true)
  }, t.addGuest)), /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: Object.keys(counts).map(id => ({
      id,
      label: t.tabs[id],
      count: fmt(counts[id], lang)
    })),
    style: {
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginBottom: 14,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: t.search,
    size: "sm",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      width: 320,
      maxWidth: '100%'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "filter"
  }, t.filter), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "download"
  }, t.export), sel.length > 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginInlineStart: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 6px 4px 12px',
      background: 'var(--ink)',
      color: 'var(--text-on-dark)',
      borderRadius: 'var(--radius-md)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      fontWeight: 600,
      marginInlineEnd: 6
    }
  }, fmt(sel.length, lang), " ", t.selected), [['send', t.sendInv], ['bell', t.sendRem], ['check-circle', t.markRsvp], ['download', t.export]].map(([ic, l]) => /*#__PURE__*/React.createElement(Button, {
    key: l,
    size: "sm",
    variant: "ghost",
    icon: ic,
    style: {
      color: 'var(--text-on-dark)'
    },
    onClick: () => {
      setToast(l);
      setSel([]);
    }
  }, l)), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    icon: "trash-2",
    style: {
      color: '#F1B3A5'
    },
    onClick: () => setConfirmDel(true)
  }, t.deleteG)) : null), /*#__PURE__*/React.createElement(Table, {
    selectable: true,
    selected: sel,
    onSelect: setSel,
    columns: cols,
    rows: rows,
    onRowClick: setDetail,
    emptyState: /*#__PURE__*/React.createElement(EmptyState, {
      icon: "search",
      title: t.noResults,
      description: t.noResultsD,
      action: /*#__PURE__*/React.createElement(Button, {
        variant: "secondary",
        size: "sm",
        onClick: () => {
          setQ('');
          setTab('all');
        }
      }, lang === 'ar' ? 'إزالة التصفية' : 'Clear filters')
    })
  }), adding ? /*#__PURE__*/React.createElement(AddGuest, {
    t: t,
    lang: lang,
    onClose: () => setAdding(false),
    onSaved: m => {
      setAdding(false);
      setToast(m);
    }
  }) : null, detail ? /*#__PURE__*/React.createElement(GuestDetail, {
    g: detail,
    t: t,
    lang: lang,
    onClose: () => setDetail(null)
  }) : null, confirmDel ? /*#__PURE__*/React.createElement(Dialog, {
    danger: true,
    title: lang === 'ar' ? 'حذف ضيوف سبق أن ردّوا؟' : 'Delete guests who already responded?',
    description: lang === 'ar' ? `من بين ${fmt(sel.length, lang)} ضيوف محددين، ردّ بعضهم على الدعوة. سيُحذف ردّهم من العدد المتوقع.` : `Some of the ${sel.length} selected guests have already responded. Their RSVP will be removed from the expected count.`,
    onClose: () => setConfirmDel(false),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setConfirmDel(false)
    }, t.add.cancel), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      onClick: () => {
        setConfirmDel(false);
        setSel([]);
        setToast(t.deleteG);
      }
    }, t.deleteG))
  }) : null, toast ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 24,
      insetInlineStart: 24,
      zIndex: 30
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    title: lang === 'ar' ? `تم: ${toast}` : `Done: ${toast}`,
    onDismiss: () => setToast(null)
  })) : null);
}
function AddGuest({
  t,
  lang,
  onClose,
  onSaved
}) {
  const a = t.add;
  const [type, setType] = React.useState('family');
  const [phone, setPhone] = React.useState('55 555 5123');
  const [members, setMembers] = React.useState(['', '']);
  const [n, setN] = React.useState(2);
  const dup = phone.replace(/\s/g, '') === '555555123';
  return /*#__PURE__*/React.createElement(Drawer, {
    title: a.title,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: onClose
    }, a.cancel), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => onSaved(a.draft)
    }, a.draft), /*#__PURE__*/React.createElement(Button, {
      icon: "send",
      disabled: dup,
      onClick: () => onSaved(a.saveSend)
    }, a.saveSend))
  }, /*#__PURE__*/React.createElement(Section, {
    title: a.type
  }, /*#__PURE__*/React.createElement(ChoiceCard, {
    icon: "user",
    title: a.single,
    description: a.singleD,
    selected: type === 'single',
    onClick: () => setType('single')
  }), /*#__PURE__*/React.createElement(ChoiceCard, {
    icon: "users",
    title: a.family,
    description: a.familyD,
    selected: type === 'family',
    onClick: () => setType('family')
  }), /*#__PURE__*/React.createElement(ChoiceCard, {
    icon: "user-plus",
    title: a.comp,
    description: a.compD,
    selected: type === 'companions',
    onClick: () => setType('companions')
  })), /*#__PURE__*/React.createElement(Field, {
    label: type === 'family' ? a.groupName : a.name,
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: type === 'family' ? lang === 'ar' ? 'عائلة الدوسري' : 'Al-Dosari family' : lang === 'ar' ? 'سارة القحطاني' : 'Sarah Al-Qahtani'
  })), /*#__PURE__*/React.createElement(Field, {
    label: a.phone,
    required: true,
    error: dup ? a.dup : undefined
  }, /*#__PURE__*/React.createElement(PhoneInput, {
    value: phone,
    onChange: e => setPhone(e.target.value),
    invalid: dup
  })), type === 'family' ? /*#__PURE__*/React.createElement(Section, {
    title: a.members
  }, members.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Input, {
    value: m,
    onChange: e => setMembers(members.map((x, j) => j === i ? e.target.value : x)),
    placeholder: lang === 'ar' ? `الفرد ${fmt(i + 1, lang)}` : `Member ${i + 1}`,
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    name: "grip-vertical",
    label: "reorder"
  }), /*#__PURE__*/React.createElement(IconButton, {
    name: "x",
    label: "remove",
    onClick: () => setMembers(members.filter((_, j) => j !== i))
  }))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "plus",
    onClick: () => setMembers([...members, '']),
    style: {
      alignSelf: 'flex-start'
    }
  }, a.addMember)) : null, type === 'companions' ? /*#__PURE__*/React.createElement(Field, {
    label: a.comps,
    hint: lang === 'ar' ? 'لا تحتاج معرفة أسماء المرافقين' : 'You don’t need companion names'
  }, /*#__PURE__*/React.createElement(Stepper, {
    value: n,
    max: 10,
    onChange: setN,
    format: v => fmt(v, lang)
  })) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: a.tag,
    optionalLabel: a.optional
  }, /*#__PURE__*/React.createElement(Select, {
    placeholder: a.tag,
    options: [{
      value: 'b',
      label: lang === 'ar' ? 'أهل العروس' : 'Bride’s family'
    }, {
      value: 'g',
      label: lang === 'ar' ? 'أهل العريس' : 'Groom’s family'
    }, {
      value: 'f',
      label: lang === 'ar' ? 'الأصدقاء' : 'Friends'
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: a.note,
    optionalLabel: a.optional
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "\u2026"
  }))));
}
function GuestDetail({
  g,
  t,
  lang,
  onClose
}) {
  const d = t.det;
  const ar = lang === 'ar';
  const tl = g.del === 'failed' ? [{
    label: ar ? 'في الانتظار' : 'Queued',
    time: ar ? '٤:٠٠ م' : '4:00 PM',
    tone: 'notsent',
    icon: 'clock'
  }, {
    label: ar ? 'فشل الإرسال — رقم غير متاح على واتساب' : 'Failed — number not on WhatsApp',
    time: ar ? '٤:٠١ م' : '4:01 PM',
    tone: 'failed',
    icon: 'circle-alert',
    strong: true
  }] : [{
    label: ar ? 'أُرسلت الدعوة' : 'Invitation sent',
    time: ar ? '٧:٣٢ م' : '7:32 PM',
    tone: 'notsent',
    icon: 'check'
  }, {
    label: ar ? 'تم التوصيل' : 'Delivered',
    time: ar ? '٧:٣٣ م' : '7:33 PM',
    tone: 'partial',
    icon: 'check-check'
  }, ...(['read', 'responded'].includes(g.del) ? [{
    label: ar ? 'تمت القراءة' : 'Read',
    time: ar ? '٧:٤١ م' : '7:41 PM',
    tone: 'checkedin',
    icon: 'eye'
  }] : [{
    label: ar ? 'القراءة' : 'Read',
    hollow: true,
    tone: 'notsent'
  }]), ...(g.del === 'responded' || g.rsvp === 'accepted' || g.rsvp === 'declined' ? [{
    label: g.rsvp === 'declined' ? ar ? 'اعتذار' : 'Declined' : ar ? `قبول${g.detail ? ' · ' + g.detail.ar : ''}` : `Accepted${g.detail ? ' · ' + g.detail.en : ''}`,
    time: ar ? '٧:٤٣ م' : '7:43 PM',
    tone: g.rsvp === 'declined' ? 'declined' : 'accepted',
    icon: g.rsvp === 'declined' ? 'x' : 'check',
    strong: true
  }] : [{
    label: ar ? 'الرد' : 'Response',
    hollow: true,
    tone: 'pending'
  }])];
  return /*#__PURE__*/React.createElement(Drawer, {
    title: g.name[lang],
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      icon: "trash-2",
      style: {
        color: 'var(--danger-fg)'
      }
    }, d.del), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      icon: "ban"
    }, d.cancelInv), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      icon: "pencil"
    }, d.edit), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      icon: g.del === 'failed' ? 'refresh-cw' : 'bell'
    }, g.del === 'failed' ? d.resend : d.remind))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: g.name[lang],
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 600
    }
  }, g.name[lang]), /*#__PURE__*/React.createElement(Phone, {
    value: g.phone,
    style: {
      fontSize: 14
    }
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "whatsapp",
    size: "sm",
    icon: "message-circle"
  }, d.openWa)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: g.rsvp,
    lang: lang,
    detail: g.detail && g.detail[lang]
  }), /*#__PURE__*/React.createElement(StatusPill, {
    kind: "delivery",
    status: g.del,
    lang: lang
  }), /*#__PURE__*/React.createElement(Tag, null, g.tag[lang])), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Card, {
    tone: "sunken",
    padding: "14px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)',
      fontWeight: 600
    }
  }, d.invDef), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      marginTop: 4
    }
  }, t.types[g.type]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-secondary)'
    }
  }, g.type === 'companions' ? `${d.maxComp}: ${fmt(g.maxComp, lang)}` : g.type === 'family' ? `${fmt(g.size, lang)} ${d.members.toLowerCase()}` : ar ? 'شخص واحد' : '1 person')), /*#__PURE__*/React.createElement(Card, {
    tone: "sunken",
    padding: "14px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)',
      fontWeight: 600
    }
  }, d.partySize), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontSize: 26,
      fontWeight: 600,
      marginTop: 2,
      lineHeight: 1.2
    }
  }, fmt(g.exp, lang), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 400,
      color: 'var(--text-secondary)'
    }
  }, t.peopleUnit)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-secondary)'
    }
  }, d.lastResp, ": ", g.last[lang]))), g.type === 'family' ? /*#__PURE__*/React.createElement(Section, {
    title: d.members
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, g.members.map((m, i) => /*#__PURE__*/React.createElement(Checkbox, {
    key: m,
    checked: !!(g.attending && g.attending[i]),
    label: ar ? m : g.membersEn[i],
    description: g.attending ? g.attending[i] ? ar ? 'سيحضر' : 'Attending' : ar ? 'لن يحضر' : 'Not attending' : ar ? 'لم يرد' : 'No response'
  })))) : null, /*#__PURE__*/React.createElement(Section, {
    title: d.delivery
  }, /*#__PURE__*/React.createElement(Timeline, {
    items: tl
  })), /*#__PURE__*/React.createElement(Section, {
    title: d.history
  }, /*#__PURE__*/React.createElement(Timeline, {
    dense: true,
    items: [{
      label: ar ? 'أُضيف الضيف' : 'Guest added',
      time: ar ? '٣ مايو' : '3 May',
      tone: 'notsent',
      meta: ar ? 'بواسطة نورة الشمري (استيراد Excel)' : 'by Noura Al-Shammari (Excel import)'
    }, ...(g.rsvp === 'declined' ? [{
      label: ar ? 'تغيير الرد يدويًا إلى اعتذار' : 'RSVP manually changed to Declined',
      time: ar ? '٥:٢٢ م' : '5:22 PM',
      tone: 'declined',
      meta: ar ? 'بواسطة خالد العمري' : 'by Khalid Al-Omari'
    }] : [])]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "pencil-line"
  }, d.changeRsvp), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "link"
  }, d.copyLink)));
}
Object.assign(window, {
  Guests
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-dashboard/guests.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-dashboard/overview.screen.jsx
try { (() => {
const {
  StatCard,
  ProgressBar,
  Funnel,
  Timeline,
  Banner,
  Card,
  Button,
  Avatar,
  Switch,
  Tag,
  StatusPill
} = DS;
function Overview({
  t,
  lang,
  setPage,
  eventDay,
  setEventDay
}) {
  const S = STATS;
  const activity = lang === 'ar' ? [{
    label: 'محمد العتيبي قبل الدعوة مع مرافقَين',
    time: '٧:٤٣ م',
    tone: 'accepted',
    icon: 'check',
    meta: '٣ أشخاص متوقعون'
  }, {
    label: 'عائلة الدوسري: قبول جزئي',
    time: '٦:١٠ م',
    tone: 'partial',
    icon: 'users',
    meta: '٣ من ٤ سيحضرون'
  }, {
    label: 'تغيير الرد يدويًا لريم المطيري',
    time: '٥:٢٢ م',
    tone: 'notsent',
    icon: 'pencil',
    meta: 'بواسطة خالد العمري'
  }, {
    label: 'اكتمل التذكير التلقائي الأول',
    time: 'أمس',
    tone: 'checkedin',
    icon: 'bell',
    meta: 'أُرسل إلى ١٠٤ مجموعات'
  }] : [{
    label: 'Mohammed Al-Otaibi accepted with 2 companions',
    time: '7:43 PM',
    tone: 'accepted',
    icon: 'check',
    meta: '3 people expected'
  }, {
    label: 'Al-Dosari family: partially accepted',
    time: '6:10 PM',
    tone: 'partial',
    icon: 'users',
    meta: '3 of 4 attending'
  }, {
    label: 'RSVP changed manually for Reem Al-Mutairi',
    time: '5:22 PM',
    tone: 'notsent',
    icon: 'pencil',
    meta: 'by Khalid Al-Omari'
  }, {
    label: 'First automatic reminder completed',
    time: 'Yesterday',
    tone: 'checkedin',
    icon: 'bell',
    meta: 'Sent to 104 groups'
  }];
  const team = lang === 'ar' ? [['خالد العمري', 'مالك'], ['نورة الشمري', 'مضيف مشارك'], ['فهد الحارثي', 'تسجيل الدخول']] : [['Khalid Al-Omari', 'Owner'], ['Noura Al-Shammari', 'Co-host'], ['Fahad Al-Harthi', 'Check-in']];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.event,
    meta: t.eventMeta
  }, /*#__PURE__*/React.createElement(Switch, {
    checked: eventDay,
    onChange: setEventDay,
    label: t.eventDay
  }), eventDay ? /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    icon: "qr-code",
    onClick: () => setPage('checkin')
  }, t.openCheckin) : /*#__PURE__*/React.createElement(Button, {
    icon: "send",
    onClick: () => setPage('sending')
  }, t.sendInv)), eventDay ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Card, {
    tone: "dark",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 24
    }
  }, [[t.expected, S.expected, 'peopleUnit'], [t.checkedin, S.checkedin, 'peopleUnit'], [t.remaining, S.expected - S.checkedin, 'peopleUnit'], [t.checkinPct, Math.round(S.checkedin / S.expected * 100) + (lang === 'ar' ? '٪' : '%'), null]].map(([l, v, u], i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      opacity: .7,
      fontWeight: 500
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 48,
      fontWeight: 600,
      lineHeight: 1.1,
      letterSpacing: '-.01em'
    }
  }, typeof v === 'number' ? fmt(v, lang) : v), u ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      opacity: .7
    }
  }, t[u]) : null)))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: 999,
      background: 'rgba(255,255,255,.12)',
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      height: '100%',
      width: `${S.checkedin / S.expected * 100}%`,
      borderRadius: 999,
      background: 'var(--bronze-light)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid2"
  }, /*#__PURE__*/React.createElement(Card, {
    title: t.arrivals
  }, /*#__PURE__*/React.createElement(Timeline, {
    dense: true,
    items: (lang === 'ar' ? [['عائلة العنزي — ٣ أشخاص', '٨:٤١ م', 'badge-check', 'checkedin'], ['سارة القحطاني', '٨:٣٩ م', 'badge-check', 'checkedin'], ['محاولة مسح مكرر — محمد العتيبي', '٨:٣٥ م', 'triangle-alert', 'pending'], ['عائلة الدوسري — ٢ من ٣', '٨:٣٠ م', 'users', 'partial']] : [['Al-Anazi family — 3 people', '8:41 PM', 'badge-check', 'checkedin'], ['Sarah Al-Qahtani', '8:39 PM', 'badge-check', 'checkedin'], ['Duplicate QR attempt — Mohammed Al-Otaibi', '8:35 PM', 'triangle-alert', 'pending'], ['Al-Dosari family — 2 of 3', '8:30 PM', 'users', 'partial']]).map(([label, time, icon, tone]) => ({
      label,
      time,
      icon,
      tone
    }))
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Banner, {
    kind: "warning",
    title: lang === 'ar' ? 'محاولة مسح مكرر لدعوة واحدة' : '1 duplicate QR attempt',
    actionLabel: lang === 'ar' ? 'عرض' : 'View',
    compact: true
  }), /*#__PURE__*/React.createElement(Banner, {
    kind: "info",
    icon: "search",
    title: lang === 'ar' ? 'ضيفان لم يُعثر عليهما بالمسح' : '2 guests not found by scan',
    actionLabel: lang === 'ar' ? 'بحث يدوي' : 'Manual search',
    compact: true
  })))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "grid4",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Banner, {
    kind: "danger",
    title: t.att1,
    description: t.att1d,
    actionLabel: t.att1a,
    onAction: () => setPage('sending')
  }), /*#__PURE__*/React.createElement(Banner, {
    kind: "warning",
    title: t.att2,
    actionLabel: t.att2a,
    onAction: () => setPage('reminders'),
    compact: true
  }), /*#__PURE__*/React.createElement(Banner, {
    kind: "info",
    icon: "calendar",
    title: t.att3,
    actionLabel: t.att3a,
    onAction: () => setPage('guests'),
    compact: true
  }), /*#__PURE__*/React.createElement(Banner, {
    kind: "neutral",
    icon: "send",
    title: t.att4,
    actionLabel: t.att4a,
    onAction: () => setPage('sending'),
    compact: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid4",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: t.groups,
    value: S.groups,
    context: t.groupsUnit,
    icon: "mail",
    lang: lang,
    onClick: () => setPage('guests')
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: t.named,
    value: S.named,
    context: t.peopleUnit,
    icon: "users",
    lang: lang
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: t.pending,
    value: S.pending + S.notsent,
    context: t.groupsUnit,
    tone: "pending",
    lang: lang,
    footnote: `${fmt(S.notsent, lang)} ${t.notsent.toLowerCase()}`,
    onClick: () => setPage('reminders')
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: t.expected,
    value: S.expected,
    context: t.peopleUnit,
    tone: "accepted",
    lang: lang,
    footnote: lang === 'ar' ? '+١٨ هذا الأسبوع' : '+18 this week'
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid2",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    title: t.rsvpProgress,
    subtitle: `${fmt(S.groups, lang)} ${t.groupsUnit}`
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    lang: lang,
    segments: [{
      label: t.accepted,
      value: S.accepted,
      tone: 'accepted'
    }, {
      label: t.partial,
      value: S.partial,
      tone: 'partial'
    }, {
      label: t.declined,
      value: S.declined,
      tone: 'declined'
    }, {
      label: t.pending,
      value: S.pending,
      tone: 'pending'
    }, {
      label: t.notsent,
      value: S.notsent,
      tone: 'notsent'
    }]
  })), /*#__PURE__*/React.createElement(Card, {
    title: t.funnel
  }, /*#__PURE__*/React.createElement(Funnel, {
    lang: lang,
    steps: [t.sent, t.delivered, t.read, t.responded].map((label, i) => ({
      label,
      value: S.funnel[i]
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid2"
  }, /*#__PURE__*/React.createElement(Card, {
    title: t.activity,
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      iconEnd: "arrow-left",
      onClick: () => setPage('guests')
    }, t.viewAll)
  }, /*#__PURE__*/React.createElement(Timeline, {
    items: activity
  })), /*#__PURE__*/React.createElement(Card, {
    title: t.team,
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      iconEnd: "arrow-left",
      onClick: () => setPage('team')
    }, t.viewAll)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, team.map(([n, r]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: n,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      fontWeight: 500
    }
  }, n), /*#__PURE__*/React.createElement(Tag, {
    size: "sm"
  }, r))))))));
}
Object.assign(window, {
  Overview
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-dashboard/overview.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-dashboard/reminders.screen.jsx
try { (() => {
const {
  Card,
  Button,
  StatCard,
  Switch,
  Timeline,
  Dialog,
  Banner,
  Select,
  Field
} = DS;
function Reminders({
  t,
  lang
}) {
  const ar = lang === 'ar';
  const [seg, setSeg] = React.useState('none');
  const [auto, setAuto] = React.useState(true);
  const [confirm, setConfirm] = React.useState(false);
  const segs = [['none', ar ? 'لم يردّوا' : 'No response', 89, 'pending'], ['unread', ar ? 'أُرسلت ولم تُقرأ' : 'Sent but unread', 22, 'notsent'], ['read', ar ? 'قُرئت دون رد' : 'Read, no response', 67, 'partial'], ['deadline', ar ? 'قرب انتهاء موعد الرد' : 'Deadline approaching', 89, 'declined']];
  const cur = segs.find(s => s[0] === seg);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.nav.reminders,
    meta: ar ? 'ينتهي موعد الردود الأحد ١٠ مايو · التذكيرات لا تُرسل لمن قبل أو اعتذر أو فشل رقمه' : 'RSVP closes Sun 10 May · Reminders skip accepted, declined and failed numbers'
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "bell",
    onClick: () => setConfirm(true)
  }, ar ? `إرسال تذكير إلى ${fmt(cur[2], lang)} مجموعة` : `Send reminder to ${cur[2]} groups`)), /*#__PURE__*/React.createElement("div", {
    className: "grid4",
    style: {
      marginBottom: 14
    }
  }, segs.map(([id, l, v, tone]) => /*#__PURE__*/React.createElement(StatCard, {
    key: id,
    label: l,
    value: v,
    context: t.groupsUnit,
    tone: tone,
    lang: lang,
    onClick: () => setSeg(id),
    style: seg === id ? {
      borderColor: 'var(--ink)',
      boxShadow: '0 0 0 1px var(--ink)'
    } : undefined
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid2"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Banner, {
    kind: "warning",
    title: ar ? 'أرسلت لـ ٤١ من هؤلاء الضيوف تذكيرًا أمس' : 'You sent 41 of these guests a reminder yesterday',
    description: ar ? 'سيتم استثناؤهم تلقائيًا لتجنّب الإزعاج.' : 'They’ll be excluded automatically to avoid spamming.',
    actionLabel: ar ? 'عرضهم' : 'Show them'
  }), /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'التذكيرات التلقائية' : 'Automatic reminders',
    actions: /*#__PURE__*/React.createElement(Switch, {
      checked: auto,
      onChange: setAuto
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      opacity: auto ? 1 : .5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'التذكير الأول' : 'First reminder'
  }, /*#__PURE__*/React.createElement(Select, {
    value: "3d",
    options: [{
      value: '3d',
      label: ar ? '٣ أيام بعد الدعوة' : '3 days after invitation'
    }, {
      value: '5d',
      label: ar ? '٥ أيام بعد الدعوة' : '5 days after invitation'
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'التذكير النهائي' : 'Final reminder'
  }, /*#__PURE__*/React.createElement(Select, {
    value: "2d",
    options: [{
      value: '2d',
      label: ar ? 'يومان قبل إغلاق الردود' : '2 days before RSVP closes'
    }, {
      value: '1d',
      label: ar ? 'يوم قبل إغلاق الردود' : '1 day before RSVP closes'
    }]
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, ar ? 'لا يُرسل تذكير إلى: من قبلوا · من اعتذروا · الأرقام الفاشلة · الدعوات الملغاة' : 'Never reminded: accepted · declined · failed numbers · cancelled invitations')))), /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'سجل التذكيرات' : 'Reminder history'
  }, /*#__PURE__*/React.createElement(Timeline, {
    items: (ar ? [['التذكير التلقائي الأول', 'أمس ٦:٠٠ م', 'أُرسل إلى ١٠٤ مجموعات · ردّ ٣١'], ['تذكير يدوي — أهل العريس', '٤ مايو', 'أُرسل إلى ٤١ مجموعة · بواسطة نورة الشمري'], ['التذكير النهائي', 'الجمعة ٨ مايو', 'مجدول']] : [['First automatic reminder', 'Yesterday 6:00 PM', 'Sent to 104 groups · 31 responded'], ['Manual reminder — Groom’s family', '4 May', 'Sent to 41 groups · by Noura Al-Shammari'], ['Final reminder', 'Fri 8 May', 'Scheduled']]).map(([label, time, meta], i) => ({
      label,
      time,
      meta,
      tone: i === 2 ? 'pending' : 'checkedin',
      hollow: i === 2,
      icon: i === 2 ? undefined : 'bell'
    }))
  }))), confirm ? /*#__PURE__*/React.createElement(Dialog, {
    title: ar ? `إرسال تذكير إلى ${fmt(cur[2] - 41, lang)} مجموعة؟` : `Send reminder to ${cur[2] - 41} groups?`,
    description: ar ? 'استُثني ٤١ ضيفًا تلقّوا تذكيرًا أمس. الرسالة: "نودّ تذكيركم بدعوتنا…"' : '41 guests reminded yesterday are excluded. Message: “A gentle reminder of our invitation…”',
    onClose: () => setConfirm(false),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setConfirm(false)
    }, t.add.cancel), /*#__PURE__*/React.createElement(Button, {
      icon: "bell",
      onClick: () => setConfirm(false)
    }, ar ? 'إرسال التذكير' : 'Send reminder'))
  }) : null);
}
Object.assign(window, {
  Reminders
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-dashboard/reminders.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-dashboard/sending.screen.jsx
try { (() => {
const {
  Card,
  Tabs,
  Button,
  Field,
  Select,
  Radio,
  Tag,
  Dialog,
  Banner,
  StatCard,
  StatusPill,
  Input,
  Toast,
  Icon
} = DS;
const WA_MSG = {
  ar: {
    hello: n => `مرحبًا ${n}،`,
    body: 'بمشيئة الله يسرّنا دعوتكم لحضور حفل زواج محمد ونورة.',
    when: 'الخميس ١٤ مايو ٢٠٢٦ · ٨:٣٠ م',
    where: 'قاعة الماسة — الرياض',
    scope: {
      single: 'هذه الدعوة خاصة بك.',
      family: 'هذه الدعوة تشمل ٤ أشخاص من العائلة.',
      companions: 'هذه الدعوة لك ولمرافقَين اثنين على الأكثر.'
    },
    btns: {
      single: ['سأحضر', 'أعتذر'],
      family: ['سيحضر الجميع', 'اختيار الحاضرين', 'يعتذر الجميع'],
      companions: ['أنا فقط', 'أنا + ١', 'أنا + ٢', 'أعتذر']
    },
    view: 'عرض الدعوة'
  },
  en: {
    hello: n => `Hello ${n},`,
    body: 'We are pleased to invite you to the wedding of Mohammed & Noura.',
    when: 'Thursday 14 May 2026 · 8:30 PM',
    where: 'Al Masa Hall — Riyadh',
    scope: {
      single: 'This invitation is for you.',
      family: 'This invitation includes 4 members of your family.',
      companions: 'This invitation is for you and up to two companions.'
    },
    btns: {
      single: ['I will attend', 'Decline'],
      family: ['Everyone attending', 'Select attendees', 'Everyone declines'],
      companions: ['Me only', 'Me + 1', 'Me + 2', 'Decline']
    },
    view: 'View invitation'
  }
};
function WaPreview({
  type,
  lang,
  name
}) {
  const m = WA_MSG[lang];
  return /*#__PURE__*/React.createElement("div", {
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    style: {
      background: 'var(--wa-bg)',
      borderRadius: 'var(--radius-lg)',
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--wa-bubble-in)',
      borderRadius: 10,
      padding: '10px 12px',
      fontSize: 14,
      lineHeight: 1.6,
      boxShadow: '0 1px 1px rgba(0,0,0,.08)',
      color: '#111B21'
    }
  }, /*#__PURE__*/React.createElement("div", null, m.hello(name)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, m.body), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontWeight: 600
    }
  }, m.when, /*#__PURE__*/React.createElement("br", null), m.where), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, m.scope[type]), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'end',
      fontSize: 11,
      color: '#667781',
      marginTop: 4
    }
  }, "7:32 PM")), [m.view, ...m.btns[type]].map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: b,
    style: {
      background: 'var(--wa-bubble-in)',
      borderRadius: 10,
      padding: '10px 12px',
      textAlign: 'center',
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--wa-link)',
      boxShadow: '0 1px 1px rgba(0,0,0,.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, i === 0 ? /*#__PURE__*/React.createElement(Icon, {
    name: "external-link",
    size: 15
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: "reply",
    size: 15
  }), b)));
}
function Sending({
  t,
  lang
}) {
  const ar = lang === 'ar';
  const [type, setType] = React.useState('companions');
  const [aud, setAud] = React.useState('unsent');
  const [confirm, setConfirm] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const names = {
    single: ar ? 'سارة' : 'Sarah',
    family: ar ? 'عائلة الدوسري' : 'Al-Dosari family',
    companions: ar ? 'محمد' : 'Mohammed'
  };
  const send = () => {
    setConfirm(false);
    setProgress({
      queued: 29,
      sent: 0,
      delivered: 0,
      failed: 0
    });
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setProgress({
        queued: Math.max(0, 29 - i * 4),
        sent: Math.min(29, i * 4),
        delivered: Math.min(27, Math.max(0, i * 4 - 3)),
        failed: i > 5 ? 2 : 0
      });
      if (i >= 8) clearInterval(iv);
    }, 500);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.nav.sending,
    meta: ar ? '٢٩ مجموعة دعوات جاهزة للإرسال · ٤٢٣ أُرسلت سابقًا' : '29 invitation groups ready to send · 423 already sent'
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "smartphone"
  }, ar ? 'إرسال رسالة تجريبية' : 'Send test message'), /*#__PURE__*/React.createElement(Button, {
    icon: "send",
    onClick: () => setConfirm(true)
  }, ar ? 'إرسال ٢٩ دعوة' : 'Send 29 invitations')), progress ? /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'تقدّم الإرسال' : 'Sending progress',
    subtitle: ar ? 'لا تُرسل كل الرسائل فورًا — قد يستغرق التوصيل دقائق.' : 'Messages don’t all send instantly — delivery can take minutes.',
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid4"
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: ar ? 'في الانتظار' : 'Queued',
    value: progress.queued,
    lang: lang,
    tone: "pending"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: t.sent,
    value: progress.sent,
    lang: lang,
    tone: "notsent"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: t.delivered,
    value: progress.delivered,
    lang: lang,
    tone: "partial"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: ar ? 'فشل' : 'Failed',
    value: progress.failed,
    lang: lang,
    tone: "failed"
  })), progress.failed > 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, [[ar ? 'نواف الحربي' : 'Nawaf Al-Harbi', '+966544000999', ar ? 'الرقم غير متاح على واتساب' : 'Number not available on WhatsApp'], [ar ? 'هند السبيعي' : 'Hind Al-Subaie', '+96651122334', ar ? 'رقم غير صالح' : 'Invalid phone number']].map(([n, p, r]) => /*#__PURE__*/React.createElement("div", {
    key: p,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)'
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    kind: "delivery",
    status: "failed",
    lang: lang,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500
    }
  }, n), /*#__PURE__*/React.createElement(DS.Phone, {
    value: p
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 13,
      color: 'var(--text-secondary)'
    }
  }, r), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    icon: "pencil"
  }, ar ? 'تعديل الرقم' : 'Edit number'), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    icon: "refresh-cw"
  }, ar ? 'إعادة المحاولة' : 'Retry'), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost"
  }, ar ? 'إزالة' : 'Remove')))) : null) : null, /*#__PURE__*/React.createElement("div", {
    className: "two"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'قالب الرسالة' : 'Message template'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'القالب' : 'Template'
  }, /*#__PURE__*/React.createElement(Select, {
    value: "formal",
    options: [{
      value: 'formal',
      label: ar ? 'الدعوة الرسمية' : 'Formal invitation'
    }, {
      value: 'warm',
      label: ar ? 'الدعوة الودّية' : 'Warm invitation'
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'اللغة' : 'Language'
  }, /*#__PURE__*/React.createElement(Select, {
    value: lang,
    options: [{
      value: 'ar',
      label: 'العربية'
    }, {
      value: 'en',
      label: 'English'
    }]
  }))), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'رسالة إضافية (اختياري)' : 'Extra message (optional)',
    hint: ar ? 'المتغيرات تُستبدل تلقائيًا لكل ضيف.' : 'Variables fill in automatically per guest.'
  }, /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    defaultValue: ar ? 'يشرفنا حضوركم ومشاركتنا الفرحة.' : 'We would be honoured to have you share our joy.',
    style: {
      width: '100%',
      padding: 12,
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)',
      background: 'var(--surface-card)',
      resize: 'vertical',
      fontSize: 14,
      lineHeight: 1.6
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginTop: 10
    }
  }, (ar ? ['اسم الضيف', 'اسم المناسبة', 'التاريخ', 'الوقت', 'المكان', 'عدد المرافقين'] : ['Guest name', 'Event name', 'Date', 'Time', 'Venue', 'Allowed companions']).map(v => /*#__PURE__*/React.createElement(Tag, {
    key: v,
    tone: "outline",
    size: "sm"
  }, '{' + v + '}')))), /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'الجمهور' : 'Audience',
    subtitle: ar ? 'من سيستلم هذه الدعوة؟' : 'Who receives this send?'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Radio, {
    name: "aud",
    value: "unsent",
    checked: aud === 'unsent',
    onChange: setAud,
    label: ar ? 'كل الدعوات غير المرسلة' : 'All unsent invitations',
    description: ar ? '٢٩ مجموعة دعوات' : '29 invitation groups'
  }), /*#__PURE__*/React.createElement(Radio, {
    name: "aud",
    value: "selected",
    checked: aud === 'selected',
    onChange: setAud,
    label: ar ? 'المجموعات المحددة فقط' : 'Selected groups only',
    description: ar ? 'لم تحدد أي مجموعة بعد' : 'No groups selected yet'
  }), /*#__PURE__*/React.createElement(Radio, {
    name: "aud",
    value: "cat",
    checked: aud === 'cat',
    onChange: setAud,
    label: ar ? 'تصنيف معيّن' : 'A specific category',
    description: ar ? 'أهل العروس · أهل العريس · الأصدقاء…' : 'Bride’s family · Groom’s family · Friends…'
  }))), /*#__PURE__*/React.createElement(Banner, {
    kind: "success",
    icon: "message-circle",
    title: ar ? 'واتساب متصل وجاهز للإرسال' : 'WhatsApp connected and ready to send',
    description: ar ? 'القالب معتمد · ١٥٠ رصيدًا متبقيًا' : 'Template approved · 150 credits remaining',
    actionLabel: ar ? 'الإعدادات' : 'Settings'
  })), /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'معاينة واتساب' : 'WhatsApp preview',
    subtitle: ar ? 'كل نوع دعوة يحصل على أزرار مختلفة' : 'Each invitation type gets different buttons'
  }, /*#__PURE__*/React.createElement(Tabs, {
    variant: "pill",
    value: type,
    onChange: setType,
    items: [{
      id: 'single',
      label: t.types.single
    }, {
      id: 'family',
      label: t.types.family
    }, {
      id: 'companions',
      label: t.types.companions
    }],
    style: {
      marginBottom: 12
    }
  }), /*#__PURE__*/React.createElement(WaPreview, {
    type: type,
    lang: lang,
    name: names[type]
  }))), confirm ? /*#__PURE__*/React.createElement(Dialog, {
    title: ar ? 'إرسال ٢٩ دعوة الآن؟' : 'Send 29 invitations now?',
    description: ar ? 'القالب: الدعوة الرسمية (عربي) · المستلمون: كل الدعوات غير المرسلة · سيُستخدم ٢٩ رصيدًا من ١٥٠. لا يمكن التراجع عن الرسائل بعد إرسالها.' : 'Template: Formal (Arabic) · Recipients: all unsent · 29 of 150 credits will be used. Messages cannot be recalled once sent.',
    onClose: () => setConfirm(false),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setConfirm(false)
    }, t.add.cancel), /*#__PURE__*/React.createElement(Button, {
      icon: "send",
      onClick: send
    }, ar ? 'إرسال الآن' : 'Send now'))
  }) : null);
}
Object.assign(window, {
  Sending,
  WaPreview,
  WA_MSG
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-dashboard/sending.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-dashboard/settings.screen.jsx
try { (() => {
const {
  Card,
  Button,
  Field,
  Input,
  Select,
  Switch,
  Avatar,
  Tag,
  StatusPill,
  IconButton,
  Dialog,
  StatCard,
  EmptyState,
  ProgressBar,
  Checkbox,
  Icon
} = DS;
function Settings({
  t,
  lang
}) {
  const ar = lang === 'ar';
  const [del, setDel] = React.useState(false);
  const [typed, setTyped] = React.useState('');
  const S = ({
    title,
    desc,
    children
  }) => /*#__PURE__*/React.createElement(Card, {
    title: title,
    subtitle: desc
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, children));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.nav.settings,
    meta: t.event
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, ar ? 'إلغاء' : 'Discard'), /*#__PURE__*/React.createElement(Button, null, ar ? 'حفظ التغييرات' : 'Save changes')), /*#__PURE__*/React.createElement("div", {
    className: "grid2",
    style: {
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(S, {
    title: ar ? 'معلومات المناسبة' : 'Event information'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'اسم المناسبة' : 'Event name'
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: t.event
  })), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'نوع المناسبة' : 'Event type'
  }, /*#__PURE__*/React.createElement(Select, {
    value: "wedding",
    options: [{
      value: 'wedding',
      label: ar ? 'زواج' : 'Wedding'
    }, {
      value: 'eng',
      label: ar ? 'خطوبة' : 'Engagement'
    }, {
      value: 'grad',
      label: ar ? 'تخرج' : 'Graduation'
    }, {
      value: 'other',
      label: ar ? 'أخرى' : 'Other'
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'التاريخ' : 'Date'
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    defaultValue: "2026-05-14"
  })), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'وقت البداية' : 'Start time'
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    defaultValue: "20:30"
  })), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'القاعة' : 'Venue'
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: ar ? 'قاعة الماسة' : 'Al Masa Hall'
  })), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'المدينة' : 'City'
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: ar ? 'الرياض' : 'Riyadh'
  }))), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'رابط الخريطة' : 'Map link'
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    icon: "map-pin",
    defaultValue: "https://maps.app.goo.gl/\u2026"
  }))), /*#__PURE__*/React.createElement(S, {
    title: ar ? 'إعدادات الردود' : 'RSVP settings'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'موعد إغلاق الردود' : 'RSVP deadline'
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    defaultValue: "2026-05-10"
  })), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'اللغات' : 'Languages'
  }, /*#__PURE__*/React.createElement(Select, {
    value: "both",
    options: [{
      value: 'ar',
      label: 'العربية'
    }, {
      value: 'en',
      label: 'English'
    }, {
      value: 'both',
      label: ar ? 'العربية + English' : 'Arabic + English'
    }]
  }))), /*#__PURE__*/React.createElement(Switch, {
    checked: true,
    label: ar ? 'السماح للضيوف بتغيير الرد' : 'Allow guests to change their response',
    description: ar ? 'حتى موعد إغلاق الردود' : 'Until the RSVP deadline'
  }), /*#__PURE__*/React.createElement(Switch, {
    checked: true,
    label: ar ? 'قفل التغييرات قبل المناسبة' : 'Lock changes before the event',
    description: ar ? '٢٤ ساعة قبل البداية' : '24 hours before start'
  }), /*#__PURE__*/React.createElement(Switch, {
    checked: true,
    label: ar ? 'التذكيرات التلقائية' : 'Automatic reminders',
    description: ar ? 'تُدار من صفحة التذكيرات' : 'Managed on the Reminders page'
  }), /*#__PURE__*/React.createElement(Switch, {
    label: ar ? 'بطاقة دخول QR' : 'QR entry pass',
    description: ar ? 'يستلمها من قبل الدعوة عبر واتساب' : 'Sent on WhatsApp to accepted guests'
  })), /*#__PURE__*/React.createElement(Card, {
    style: {
      borderColor: 'var(--danger-bg)'
    },
    title: ar ? 'منطقة الخطر' : 'Danger zone',
    subtitle: ar ? 'إجراءات لا يمكن التراجع عنها' : 'Actions that cannot be undone'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "archive"
  }, ar ? 'أرشفة المناسبة' : 'Archive event'), /*#__PURE__*/React.createElement(Button, {
    variant: "danger-soft",
    icon: "trash-2",
    onClick: () => setDel(true)
  }, ar ? 'حذف المناسبة' : 'Delete event')))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    tone: "accent",
    title: ar ? 'اتصال واتساب' : 'WhatsApp connection',
    subtitle: ar ? 'متصل · القالب معتمد · جاهز للإرسال' : 'Connected · template approved · ready to send',
    actions: /*#__PURE__*/React.createElement(StatusPill, {
      kind: "delivery",
      status: "responded",
      label: ar ? 'جاهز' : 'Ready'
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-secondary)',
      lineHeight: 1.6
    }
  }, ar ? 'رقم المرسل: ' : 'Sender number: ', /*#__PURE__*/React.createElement("span", {
    className: "phone"
  }, "+966 11 200 0000"), /*#__PURE__*/React.createElement("br", null), ar ? 'الحالات الممكنة: غير متصل · يتطلب الإعداد · التحقق قيد الانتظار · القالب قيد الاعتماد · جاهز · غير متاح مؤقتًا' : 'States: not connected · setup required · verification pending · template pending · ready · temporarily unavailable')), /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'حالة المناسبة' : 'Event status'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, ['rsvp-open', 'rsvp-closed', 'completed', 'archived'].map(s => /*#__PURE__*/React.createElement(StatusPill, {
    key: s,
    kind: "event",
    status: s,
    lang: lang,
    variant: s === 'rsvp-open' ? 'soft' : 'plain'
  })))))), del ? /*#__PURE__*/React.createElement(Dialog, {
    danger: true,
    title: ar ? 'حذف المناسبة نهائيًا؟' : 'Permanently delete this event?',
    description: ar ? 'سيُحذف ٤٥٠ مجموعة دعوات و٦٢٠ ضيفًا وكل الردود والرسائل. اكتب اسم المناسبة للتأكيد.' : 'This removes 450 invitation groups, 620 guests and every RSVP and message. Type the event name to confirm.',
    onClose: () => setDel(false),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setDel(false)
    }, t.add.cancel), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      disabled: typed !== t.event,
      onClick: () => setDel(false)
    }, ar ? 'حذف المناسبة' : 'Delete event'))
  }, /*#__PURE__*/React.createElement(Field, {
    label: t.event
  }, /*#__PURE__*/React.createElement(Input, {
    value: typed,
    onChange: e => setTyped(e.target.value),
    placeholder: t.event
  }))) : null);
}
function Team({
  t,
  lang
}) {
  const ar = lang === 'ar';
  const [invite, setInvite] = React.useState(false);
  const perms = ar ? ['إدارة قائمة الضيوف', 'إرسال الدعوات والتذكيرات', 'عرض أرقام الجوال كاملة', 'تصدير بيانات الضيوف', 'تعديل الردود يدويًا', 'تسجيل دخول الضيوف'] : ['Manage guest list', 'Send invitations & reminders', 'View full phone numbers', 'Export guest data', 'Manage RSVP manually', 'Check guests in'];
  const members = [[ar ? 'خالد العمري' : 'Khalid Al-Omari', ar ? 'المالك' : 'Owner', 'owner', [1, 1, 1, 1, 1, 1]], [ar ? 'نورة الشمري' : 'Noura Al-Shammari', ar ? 'مضيف مشارك' : 'Co-host', 'active', [1, 1, 1, 0, 1, 0]], [ar ? 'فهد الحارثي' : 'Fahad Al-Harthi', ar ? 'موظف تسجيل دخول' : 'Check-in staff', 'active', [0, 0, 0, 0, 0, 1]], [ar ? 'سلطان القحطاني' : 'Sultan Al-Qahtani', ar ? 'مضيف مشارك' : 'Co-host', 'pending', [1, 1, 0, 0, 0, 0]]];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.nav.team,
    meta: ar ? 'المالك يتحكم بالصلاحيات · الفوترة والحذف ونقل الملكية للمالك فقط' : 'Owner controls permissions · billing, deletion and ownership transfer are owner-only'
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "user-plus",
    onClick: () => setInvite(true)
  }, ar ? 'دعوة مضيف مشارك' : 'Invite co-host')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, members.map(([n, r, st, p]) => /*#__PURE__*/React.createElement(Card, {
    key: n,
    padding: "16px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: n,
    tone: st === 'owner' ? 'dark' : 'soft'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 180
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600
    }
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, r)), st === 'pending' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StatusPill, {
    kind: "delivery",
    status: "queued",
    label: ar ? 'دعوة معلّقة' : 'Invitation pending',
    lang: lang,
    size: "sm"
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    icon: "refresh-cw"
  }, ar ? 'إعادة الإرسال' : 'Resend'), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost"
  }, ar ? 'إلغاء الدعوة' : 'Revoke')) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), st !== 'owner' ? /*#__PURE__*/React.createElement(IconButton, {
    name: "ellipsis",
    label: t.more,
    size: "sm"
  }) : /*#__PURE__*/React.createElement(Tag, {
    tone: "accent",
    size: "sm"
  }, ar ? 'صلاحيات كاملة' : 'Full access')), st !== 'owner' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: '10px 20px',
      marginTop: 14,
      paddingTop: 14,
      borderTop: '1px solid var(--border-default)'
    }
  }, perms.map((pl, i) => /*#__PURE__*/React.createElement(Switch, {
    key: pl,
    checked: !!p[i],
    label: pl,
    disabled: st === 'pending'
  }))) : null))), invite ? /*#__PURE__*/React.createElement(Dialog, {
    title: ar ? 'دعوة مضيف مشارك' : 'Invite co-host',
    description: ar ? 'سيستلم رابط الانضمام عبر واتساب أو البريد.' : 'They’ll receive a join link on WhatsApp or email.',
    onClose: () => setInvite(false),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setInvite(false)
    }, t.add.cancel), /*#__PURE__*/React.createElement(Button, {
      icon: "send",
      onClick: () => setInvite(false)
    }, ar ? 'إرسال الدعوة' : 'Send invite'))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'رقم الجوال أو البريد' : 'Mobile or email'
  }, /*#__PURE__*/React.createElement(DS.PhoneInput, null)), /*#__PURE__*/React.createElement(Field, {
    label: ar ? 'الدور' : 'Role'
  }, /*#__PURE__*/React.createElement(Select, {
    value: "cohost",
    options: [{
      value: 'cohost',
      label: ar ? 'مضيف مشارك' : 'Co-host'
    }, {
      value: 'checkin',
      label: ar ? 'موظف تسجيل دخول' : 'Check-in staff'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8
    }
  }, perms.map((pl, i) => /*#__PURE__*/React.createElement(Checkbox, {
    key: pl,
    checked: i < 2,
    label: pl
  }))))) : null);
}
function Checkin({
  t,
  lang
}) {
  const ar = lang === 'ar';
  const [q, setQ] = React.useState('');
  const [res, setRes] = React.useState(null);
  const [n, setN] = React.useState(3);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.nav.checkin,
    meta: ar ? 'وضع تسجيل الدخول — يعمل على الجوال والتابلت · يدعم العمل دون اتصال' : 'Check-in mode — phone & tablet friendly · works offline'
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    size: "lg",
    icon: "scan-line",
    onClick: () => setRes('scan')
  }, ar ? 'مسح رمز QR' : 'Scan QR')), /*#__PURE__*/React.createElement("div", {
    className: "grid4",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: t.expected,
    value: 497,
    context: t.peopleUnit,
    lang: lang,
    size: "lg"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: t.checkedin,
    value: 212,
    context: t.peopleUnit,
    tone: "checkedin",
    lang: lang,
    size: "lg"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: t.remaining,
    value: 285,
    context: t.peopleUnit,
    tone: "notsent",
    lang: lang,
    size: "lg"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: t.checkinPct,
    value: ar ? '٤٣٪' : '43%',
    lang: lang,
    size: "lg"
  })), /*#__PURE__*/React.createElement("div", {
    className: "two"
  }, /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'بحث عن ضيف' : 'Search guest',
    subtitle: ar ? 'للضيوف الذين فقدوا رمز QR — بالاسم أو العائلة أو الجوال' : 'For guests without their QR — name, family or mobile'
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    size: "lg",
    placeholder: t.search,
    value: q,
    onChange: e => {
      setQ(e.target.value);
      setRes(e.target.value ? 'found' : null);
    }
  }), res === 'found' || res === 'scan' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 18,
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-card)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: ar ? 'محمد العتيبي' : 'Mohammed Al-Otaibi',
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 600
    }
  }, ar ? 'محمد العتيبي' : 'Mohammed Al-Otaibi'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: 'var(--text-secondary)'
    }
  }, ar ? 'العدد المؤكد: ٣ أشخاص (١ + ٢ مرافقان)' : 'Confirmed party: 3 people (1 + 2 companions)')), /*#__PURE__*/React.createElement(StatusPill, {
    kind: "checkin",
    status: "not-arrived",
    lang: lang
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500
    }
  }, ar ? 'كم شخصًا وصل؟' : 'How many arrived?'), /*#__PURE__*/React.createElement(DS.Stepper, {
    value: n,
    max: 3,
    onChange: setN,
    format: v => fmt(v, lang),
    size: "guest"
  }), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "accent",
    icon: "badge-check",
    style: {
      flex: 1
    },
    onClick: () => setRes('done')
  }, ar ? `تسجيل دخول ${fmt(n, lang)} ${n === 3 ? '(الجميع)' : ''}` : `Check in ${n}${n === 3 ? ' (all)' : ''}`))) : res === 'done' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 24,
      background: 'var(--checkedin-bg)',
      borderRadius: 'var(--radius-card)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      color: 'var(--checkedin-fg)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "badge-check",
    size: 36,
    color: "var(--checkedin)"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 600
    }
  }, ar ? 'تم تسجيل دخول محمد العتيبي' : 'Mohammed Al-Otaibi checked in'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14
    }
  }, ar ? `${fmt(n, lang)} من ٣ أشخاص · ٨:٤١ م` : `${n} of 3 people · 8:41 PM`)), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    style: {
      marginInlineStart: 'auto'
    },
    onClick: () => setRes('dup')
  }, ar ? 'مسح التالي' : 'Scan next')) : res === 'dup' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 24,
      background: 'var(--pending-bg)',
      borderRadius: 'var(--radius-card)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      color: 'var(--pending-fg)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "triangle-alert",
    size: 36,
    color: "var(--pending)"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 600
    }
  }, ar ? 'هذه الدعوة سُجّل دخولها مسبقًا عند ٨:٤١ م' : 'This invitation was already checked in at 8:41 PM'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14
    }
  }, ar ? 'محمد العتيبي · ٣ من ٣ أشخاص' : 'Mohammed Al-Otaibi · 3 of 3 people')), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    style: {
      marginInlineStart: 'auto'
    },
    onClick: () => setRes(null)
  }, ar ? 'حسنًا' : 'OK')) : /*#__PURE__*/React.createElement(EmptyState, {
    compact: true,
    icon: "qr-code",
    title: ar ? 'امسح رمز QR أو ابحث عن ضيف' : 'Scan a QR code or search for a guest',
    description: ar ? 'رمز QR يمثّل مجموعة الدعوة كاملة، وليس شخصًا واحدًا.' : 'A QR represents the whole invitation group, not one person.'
  })), /*#__PURE__*/React.createElement(Card, {
    title: t.arrivals
  }, /*#__PURE__*/React.createElement(DS.Timeline, {
    dense: true,
    items: (ar ? [['عائلة العنزي — ٣ أشخاص', '٨:٤١ م'], ['سارة القحطاني', '٨:٣٩ م'], ['عائلة الدوسري — ٢ من ٣', '٨:٣٠ م']] : [['Al-Anazi family — 3 people', '8:41 PM'], ['Sarah Al-Qahtani', '8:39 PM'], ['Al-Dosari family — 2 of 3', '8:30 PM']]).map(([label, time], i) => ({
      label,
      time,
      icon: i === 2 ? 'users' : 'badge-check',
      tone: i === 2 ? 'partial' : 'checkedin'
    }))
  }))));
}
function Reports({
  t,
  lang
}) {
  const ar = lang === 'ar';
  const exports = ar ? ['قائمة الضيوف الكاملة', 'الحاضرون المؤكدون', 'الضيوف المعلّقون', 'قائمة تسجيل الدخول', 'تقرير الحضور النهائي'] : ['Full guest list', 'Confirmed attendees', 'Pending guests', 'Check-in list', 'Final attendance report'];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.nav.reports,
    meta: ar ? 'التقارير تفرّق دائمًا بين مجموعات الدعوات والأشخاص' : 'Reports always separate invitation groups from people'
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "download"
  }, ar ? 'تصدير الكل (Excel)' : 'Export all (Excel)')), /*#__PURE__*/React.createElement("div", {
    className: "grid3",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'ملخص الردود' : 'RSVP summary',
    subtitle: `${fmt(450, lang)} ${t.groupsUnit}`
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    lang: lang,
    segments: [{
      label: t.accepted,
      value: 280,
      tone: 'accepted'
    }, {
      label: t.partial,
      value: 31,
      tone: 'partial'
    }, {
      label: t.declined,
      value: 54,
      tone: 'declined'
    }, {
      label: t.pending,
      value: 85,
      tone: 'pending'
    }]
  })), /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'الحضور' : 'Attendance',
    subtitle: `${fmt(497, lang)} ${t.peopleUnit}`
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    lang: lang,
    segments: [{
      label: t.checkedin,
      value: 212,
      tone: 'checkedin'
    }, {
      label: ar ? 'لم يصلوا' : 'No-show so far',
      value: 285,
      tone: 'notsent'
    }]
  })), /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'نوع الدعوة' : 'Invitation type',
    subtitle: `${fmt(450, lang)} ${t.groupsUnit}`
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    lang: lang,
    segments: [{
      label: t.types.single,
      value: 210,
      tone: 'notsent'
    }, {
      label: t.types.family,
      value: 150,
      tone: 'partial'
    }, {
      label: t.types.companions,
      value: 90,
      tone: 'checkedin'
    }]
  }))), /*#__PURE__*/React.createElement(Card, {
    title: ar ? 'التصدير' : 'Exports'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, exports.map((e, i) => /*#__PURE__*/React.createElement("div", {
    key: e,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 0',
      borderTop: i ? '1px solid var(--border-default)' : 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-spreadsheet",
    size: 18,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontWeight: 500
    }
  }, e), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    icon: "download"
  }, "Excel"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost"
  }, "CSV"))))));
}
Object.assign(window, {
  Settings,
  Team,
  Checkin,
  Reports
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-dashboard/settings.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-dashboard/shell.screen.jsx
try { (() => {
const {
  Icon,
  IconButton,
  Avatar,
  Button,
  Input,
  StatusPill
} = DS;
const NAV = [['overview', 'layout-dashboard'], ['guests', 'users'], ['sending', 'send'], ['reminders', 'bell-ring'], ['checkin', 'qr-code'], ['team', 'user-plus'], ['reports', 'chart-column'], ['settings', 'settings']];
function Sidebar({
  t,
  page,
  setPage,
  lang
}) {
  return /*#__PURE__*/React.createElement("aside", {
    className: "side"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--topbar-h)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 20px',
      borderBottom: '1px solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      lineHeight: 1,
      color: 'var(--ink)'
    }
  }, "\u062F\u0639\u0648\u0629"), /*#__PURE__*/React.createElement("span", {
    className: "lbl",
    style: {
      fontSize: 11,
      letterSpacing: '.12em',
      color: 'var(--text-muted)',
      textTransform: 'uppercase'
    }
  }, "Dawah")), /*#__PURE__*/React.createElement("button", {
    className: "ev",
    type: "button",
    title: t.switchEvent,
    style: {
      margin: 12,
      padding: '10px 12px',
      textAlign: 'start',
      background: 'var(--surface-sunken)',
      border: '1px solid transparent',
      borderRadius: 'var(--radius-md)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, t.event), /*#__PURE__*/React.createElement(StatusPill, {
    kind: "event",
    status: "rsvp-open",
    lang: lang,
    size: "sm",
    variant: "plain",
    style: {
      padding: 0,
      height: 18
    }
  })), /*#__PURE__*/React.createElement(Icon, {
    name: "chevrons-up-down",
    size: 16,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '4px 12px',
      flex: 1
    }
  }, NAV.map(([id, ic]) => {
    const on = page === id;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      type: "button",
      onClick: () => setPage(id),
      "aria-current": on ? 'page' : undefined,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 40,
        padding: '0 12px',
        border: 0,
        borderRadius: 'var(--radius-md)',
        background: on ? 'var(--ink)' : 'transparent',
        color: on ? 'var(--text-on-dark)' : 'var(--text-secondary)',
        fontSize: 14,
        fontWeight: on ? 600 : 500,
        cursor: 'pointer',
        textAlign: 'start',
        transition: 'var(--transition-control)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: ic,
      size: 18
    }), /*#__PURE__*/React.createElement("span", {
      className: "lbl",
      style: {
        flex: 1
      }
    }, t.nav[id]), id === 'sending' && /*#__PURE__*/React.createElement("span", {
      className: "lbl num",
      style: {
        fontSize: 11,
        fontWeight: 600,
        padding: '1px 7px',
        borderRadius: 999,
        background: on ? 'rgba(255,255,255,.18)' : 'var(--pending-bg)',
        color: on ? '#fff' : 'var(--pending-fg)'
      }
    }, fmt(29, lang)));
  })), /*#__PURE__*/React.createElement("div", {
    className: "ev",
    style: {
      margin: 12,
      padding: 12,
      borderRadius: 'var(--radius-md)',
      background: 'var(--accent-soft)',
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      color: 'var(--accent-hover)',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", null, t.credits), /*#__PURE__*/React.createElement(Icon, {
    name: "credit-card",
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      borderRadius: 999,
      background: 'rgba(154,118,66,.2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: '25%',
      height: '100%',
      borderRadius: 999,
      background: 'var(--accent)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      color: 'var(--text-secondary)'
    }
  }, t.creditsLeft)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 20px',
      borderTop: '1px solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: t.user,
    size: "sm",
    tone: "dark"
  }), /*#__PURE__*/React.createElement("span", {
    className: "lbl",
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 600
    }
  }, t.user), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12,
      color: 'var(--text-muted)'
    }
  }, t.role)), /*#__PURE__*/React.createElement(IconButton, {
    name: "log-out",
    label: "Log out",
    size: "sm",
    flipRtl: true
  })));
}
function Topbar({
  t,
  title,
  lang,
  setLang
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 'var(--topbar-h)',
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 var(--gutter)',
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      flex: 1,
      whiteSpace: 'nowrap'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "hide-sm"
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: t.search,
    size: "sm",
    style: {
      width: 300
    }
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "languages",
    onClick: () => setLang(lang === 'ar' ? 'en' : 'ar')
  }, t.lang), /*#__PURE__*/React.createElement(IconButton, {
    name: "circle-help",
    label: t.help,
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    name: "bell",
    label: t.notif,
    size: "sm",
    badge: true
  }));
}
function BottomNav({
  t,
  page,
  setPage
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "bottomnav",
    style: {
      position: 'absolute',
      bottom: 0,
      insetInline: 0,
      height: 64,
      background: 'var(--surface-card)',
      borderTop: '1px solid var(--border-default)',
      justifyContent: 'space-around',
      alignItems: 'center',
      zIndex: 5
    }
  }, NAV.slice(0, 5).map(([id, ic]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    type: "button",
    onClick: () => setPage(id),
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      border: 0,
      background: 'transparent',
      color: page === id ? 'var(--ink)' : 'var(--text-muted)',
      fontSize: 11,
      fontWeight: 600,
      minWidth: 56,
      minHeight: 44,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 20
  }), t.nav[id])));
}
function PageHeader({
  title,
  meta,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 20,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 'var(--text-2xl)',
      fontWeight: 600,
      lineHeight: 1.25
    }
  }, title), meta ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, meta) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, children));
}
function Drawer({
  title,
  onClose,
  children,
  footer,
  width = 'var(--drawer-w)'
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--scrim)',
      zIndex: 20
    }
  }), /*#__PURE__*/React.createElement("aside", {
    role: "dialog",
    "aria-modal": true,
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      insetInlineEnd: 0,
      width,
      maxWidth: '100%',
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-overlay)',
      zIndex: 21,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '14px 20px',
      borderBottom: '1px solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      flex: 1
    }
  }, title), /*#__PURE__*/React.createElement(IconButton, {
    name: "x",
    label: "close",
    size: "sm",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end',
      padding: '14px 20px',
      borderTop: '1px solid var(--border-default)',
      flexWrap: 'wrap'
    }
  }, footer) : null));
}
function Section({
  title,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      ...style
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      color: 'var(--text-muted)',
      letterSpacing: '.04em'
    }
  }, title), children);
}
Object.assign(window, {
  Sidebar,
  Topbar,
  BottomNav,
  PageHeader,
  Drawer,
  Section
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-dashboard/shell.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/host-onboarding/onboarding.screen.jsx
try { (() => {
const DS = window.DawahInvitationsDesignSystem_51e74b;
const {
  Button,
  Field,
  Input,
  PhoneInput,
  Select,
  Switch,
  Card,
  StatusPill,
  ChoiceCard,
  Banner,
  EmptyState,
  Icon,
  IconButton,
  ProgressBar,
  Tabs,
  Stepper
} = DS;
const fmt = (n, lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-arab' : 'en-US').format(n);
const S = {
  ar: {
    tagline: 'أنشئ مناسبتك وابدأ إدارة الدعوات في دقائق.',
    sub: 'الضيوف يردّون من واتساب — دون تطبيق أو حساب أو كلمة مرور.',
    signin: 'تسجيل الدخول',
    phone: 'رقم الجوال',
    phoneH: 'سنرسل رمز تحقق عبر واتساب أو رسالة نصية',
    cont: 'متابعة',
    email: 'أو تابع بالبريد الإلكتروني',
    otp: 'أدخل رمز التحقق',
    otpD: p => `أُرسل الرمز إلى ${p}`,
    wrong: 'الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا.',
    resend: 'إعادة إرسال الرمز',
    resendIn: 'إعادة الإرسال بعد ٠:٤٢',
    changeNum: 'تغيير الرقم',
    verify: 'تأكيد',
    events: 'مناسباتي',
    newEvent: 'إنشاء مناسبة جديدة',
    open: 'فتح',
    dup: 'تكرار',
    archive: 'أرشفة',
    groups: 'مجموعة دعوات',
    rsvpDone: 'نسبة الردود',
    expected: 'شخص متوقع',
    noEvents: 'لا توجد مناسبات بعد',
    noEventsD: 'أنشئ أول مناسبة وابدأ بإضافة الضيوف.',
    wizard: 'إنشاء مناسبة',
    steps: ['نوع المناسبة', 'التفاصيل', 'إعدادات الردود', 'واتساب والجاهزية'],
    back: 'رجوع',
    next: 'التالي',
    finish: 'معاينة الدعوات',
    types: [['heart', 'زواج'], ['gem', 'خطوبة'], ['party-popper', 'حفل استقبال'], ['graduation-cap', 'تخرج'], ['calendar', 'مناسبة خاصة'], ['ellipsis', 'أخرى']],
    f: {
      name: 'اسم المناسبة',
      hosts: 'العروسان / أصحاب المناسبة',
      date: 'التاريخ',
      start: 'وقت البداية',
      end: 'وقت النهاية (اختياري)',
      city: 'المدينة',
      venue: 'القاعة',
      map: 'رابط الموقع (Google/Apple Maps)',
      tz: 'المنطقة الزمنية'
    },
    r: {
      deadline: 'موعد إغلاق الردود',
      edits: 'السماح بتغيير الرد',
      auto: 'تذكيرات تلقائية',
      autoD: 'الأول بعد ٣ أيام، والنهائي قبل يومين من الإغلاق',
      qr: 'بطاقة دخول QR',
      qrD: 'يمكن تفعيلها لاحقًا'
    },
    wa: 'اتصال واتساب',
    waStates: [['غير متصل', 'notsent'], ['يتطلب الإعداد', 'pending'], ['التحقق قيد الانتظار', 'pending'], ['القالب قيد الاعتماد', 'partial'], ['جاهز للإرسال', 'accepted'], ['غير متاح مؤقتًا', 'failed']],
    connect: 'ربط واتساب',
    check: ['تفاصيل المناسبة', 'قائمة الضيوف', 'واتساب', 'رسالة الدعوة'],
    addGuests: 'أضف الضيوف يدويًا أو استورد Excel — أو تابع دون ضيوف الآن.'
  },
  en: {
    tagline: 'Create your event and start managing invitations in minutes.',
    sub: 'Guests reply from WhatsApp — no app, no account, no password.',
    signin: 'Sign in',
    phone: 'Mobile number',
    phoneH: 'We’ll send a verification code by WhatsApp or SMS',
    cont: 'Continue',
    email: 'or continue with email',
    otp: 'Enter verification code',
    otpD: p => `Code sent to ${p}`,
    wrong: 'That code is invalid or has expired. Request a new one.',
    resend: 'Resend code',
    resendIn: 'Resend in 0:42',
    changeNum: 'Change number',
    verify: 'Verify',
    events: 'My events',
    newEvent: 'Create new event',
    open: 'Open',
    dup: 'Duplicate',
    archive: 'Archive',
    groups: 'invitation groups',
    rsvpDone: 'RSVP completion',
    expected: 'people expected',
    noEvents: 'No events yet',
    noEventsD: 'Create your first event and start adding guests.',
    wizard: 'Create event',
    steps: ['Event type', 'Details', 'RSVP settings', 'WhatsApp & readiness'],
    back: 'Back',
    next: 'Next',
    finish: 'Preview invitations',
    types: [['heart', 'Wedding'], ['gem', 'Engagement'], ['party-popper', 'Reception'], ['graduation-cap', 'Graduation'], ['calendar', 'Private event'], ['ellipsis', 'Other']],
    f: {
      name: 'Event name',
      hosts: 'Bride & groom / hosts',
      date: 'Date',
      start: 'Start time',
      end: 'End time (optional)',
      city: 'City',
      venue: 'Venue',
      map: 'Location link (Google/Apple Maps)',
      tz: 'Time zone'
    },
    r: {
      deadline: 'RSVP deadline',
      edits: 'Allow response changes',
      auto: 'Automatic reminders',
      autoD: 'First after 3 days, final 2 days before close',
      qr: 'QR entry pass',
      qrD: 'Can be enabled later'
    },
    wa: 'WhatsApp connection',
    waStates: [['Not connected', 'notsent'], ['Setup required', 'pending'], ['Verification pending', 'pending'], ['Template pending approval', 'partial'], ['Ready to send', 'accepted'], ['Temporarily unavailable', 'failed']],
    connect: 'Connect WhatsApp',
    check: ['Event details', 'Guest list', 'WhatsApp', 'Invitation message'],
    addGuests: 'Add guests manually or import Excel — or continue without guests for now.'
  }
};
const EVENTS = [{
  name: {
    ar: 'زواج محمد ونورة',
    en: 'Mohammed & Noura’s wedding'
  },
  date: {
    ar: 'الخميس ١٤ مايو ٢٠٢٦',
    en: 'Thu 14 May 2026'
  },
  venue: {
    ar: 'قاعة الماسة، الرياض',
    en: 'Al Masa Hall, Riyadh'
  },
  status: 'rsvp-open',
  groups: 450,
  pct: 80,
  exp: 497
}, {
  name: {
    ar: 'خطوبة سلطان ولمى',
    en: 'Sultan & Lama’s engagement'
  },
  date: {
    ar: 'الجمعة ٢٦ يونيو ٢٠٢٦',
    en: 'Fri 26 Jun 2026'
  },
  venue: {
    ar: 'استراحة النخيل، جدة',
    en: 'Al Nakheel, Jeddah'
  },
  status: 'sending',
  groups: 120,
  pct: 12,
  exp: 34
}, {
  name: {
    ar: 'تخرج ريم',
    en: 'Reem’s graduation'
  },
  date: {
    ar: 'السبت ٧ مارس ٢٠٢٦',
    en: 'Sat 7 Mar 2026'
  },
  venue: {
    ar: 'المنزل، الدمام',
    en: 'Home, Dammam'
  },
  status: 'completed',
  groups: 60,
  pct: 100,
  exp: 71
}];
const Wordmark = ({
  light
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: 'var(--font-display)',
    fontSize: 30,
    lineHeight: 1,
    color: light ? 'var(--paper)' : 'var(--ink)'
  }
}, "\u062F\u0639\u0648\u0629"), /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: 12,
    letterSpacing: '.14em',
    textTransform: 'uppercase',
    color: light ? 'rgba(251,249,246,.6)' : 'var(--text-muted)'
  }
}, "Dawah"));
function Auth({
  s,
  step,
  setStep,
  lang
}) {
  const [phone, setPhone] = React.useState('50 123 4567');
  const [code, setCode] = React.useState('');
  const [err, setErr] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "auth"
  }, /*#__PURE__*/React.createElement("div", {
    className: "art"
  }, /*#__PURE__*/React.createElement(Wordmark, {
    light: true
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 44,
      lineHeight: 1.3,
      maxWidth: 520
    }
  }, s.tagline), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      opacity: .7,
      marginTop: 16,
      maxWidth: 480,
      lineHeight: 1.7
    }
  }, s.sub)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 24,
      fontSize: 13,
      opacity: .6
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u0664\u0665\u0660 ", s.groups), /*#__PURE__*/React.createElement("span", null, "\u0666\u0662\u0660 ", lang === 'ar' ? 'ضيف مسمّى' : 'named guests'), /*#__PURE__*/React.createElement("span", null, "\u0664\u0669\u0667 ", s.expected))), /*#__PURE__*/React.createElement("div", {
    className: "form"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 380,
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, step === 'signin' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'var(--text-2xl)',
      fontWeight: 600
    }
  }, s.signin), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      color: 'var(--text-secondary)'
    }
  }, s.phoneH)), /*#__PURE__*/React.createElement(Field, {
    label: s.phone
  }, /*#__PURE__*/React.createElement(PhoneInput, {
    size: "lg",
    value: phone,
    onChange: e => setPhone(e.target.value)
  })), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    iconEnd: "arrow-left",
    onClick: () => setStep('otp')
  }, s.cont), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    fullWidth: true,
    icon: "mail"
  }, s.email)) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'var(--text-2xl)',
      fontWeight: 600
    }
  }, s.otp), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      color: 'var(--text-secondary)'
    }
  }, s.otpD(''), /*#__PURE__*/React.createElement("span", {
    className: "phone"
  }, "+966 ", phone))), /*#__PURE__*/React.createElement(Field, {
    error: err ? s.wrong : undefined
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    size: "guest",
    value: code,
    onChange: e => {
      setCode(e.target.value.slice(0, 4));
      setErr(false);
    },
    placeholder: "\u2022\u2022\u2022\u2022",
    invalid: err,
    inputMode: "numeric",
    inputStyle: {
      textAlign: 'center',
      fontSize: 30,
      letterSpacing: '.5em'
    }
  })), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    disabled: code.length < 4,
    onClick: () => code === '1234' ? setStep('events') : setErr(true)
  }, s.verify), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    disabled: !err
  }, err ? s.resend : s.resendIn), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => setStep('signin')
  }, s.changeNum)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: 'var(--text-muted)',
      textAlign: 'center'
    }
  }, lang === 'ar' ? 'للتجربة: 1234 صحيح، أي رمز آخر يعرض حالة الخطأ' : 'Demo: 1234 is valid, anything else shows the error state')))));
}
function Events({
  s,
  lang,
  setStep
}) {
  const [empty, setEmpty] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement(Wordmark, null), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => setEmpty(!empty)
  }, empty ? lang === 'ar' ? 'عرض المناسبات' : 'Show events' : lang === 'ar' ? 'عرض الحالة الفارغة' : 'Show empty state'), /*#__PURE__*/React.createElement(IconButton, {
    name: "bell",
    label: "notifications",
    badge: true
  }), /*#__PURE__*/React.createElement(DS.Avatar, {
    name: lang === 'ar' ? 'خالد العمري' : 'Khalid Al-Omari',
    size: "sm",
    tone: "dark"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'var(--text-2xl)',
      fontWeight: 600
    }
  }, s.events), /*#__PURE__*/React.createElement(Button, {
    icon: "plus",
    onClick: () => setStep('wizard')
  }, s.newEvent)), empty ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(EmptyState, {
    icon: "calendar-plus",
    title: s.noEvents,
    description: s.noEventsD,
    action: /*#__PURE__*/React.createElement(Button, {
      icon: "plus",
      onClick: () => setStep('wizard')
    }, s.newEvent)
  })) : /*#__PURE__*/React.createElement("div", {
    className: "cards"
  }, EVENTS.map(e => /*#__PURE__*/React.createElement(Card, {
    key: e.name.en,
    interactive: true,
    title: e.name[lang],
    subtitle: `${e.date[lang]} · ${e.venue[lang]}`,
    actions: /*#__PURE__*/React.createElement(StatusPill, {
      kind: "event",
      status: e.status,
      lang: lang,
      size: "sm"
    }),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      onClick: () => setStep('dash')
    }, s.open), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      name: "copy",
      label: s.dup,
      size: "sm"
    }), /*#__PURE__*/React.createElement(IconButton, {
      name: "archive",
      label: s.archive,
      size: "sm"
    })))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 10,
      marginTop: 6
    }
  }, [[e.groups, s.groups], [fmt(e.pct, lang) + (lang === 'ar' ? '٪' : '%'), s.rsvpDone], [e.exp, s.expected]].map(([v, l]) => /*#__PURE__*/React.createElement("div", {
    key: l
  }, /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontSize: 22,
      fontWeight: 600,
      lineHeight: 1.2
    }
  }, typeof v === 'number' ? fmt(v, lang) : v), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)'
    }
  }, l))))))));
}
function Wizard({
  s,
  lang,
  setStep
}) {
  const ar = lang === 'ar';
  const [i, setI] = React.useState(0);
  const [type, setType] = React.useState(0);
  const [wa, setWa] = React.useState(0);
  const Frame = ({
    children
  }) => /*#__PURE__*/React.createElement("div", {
    className: "wrap",
    style: {
      maxWidth: 760
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    name: "arrow-right",
    label: s.back,
    flipRtl: true,
    onClick: () => i ? setI(i - 1) : setStep('events')
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'var(--text-xl)',
      fontWeight: 600,
      flex: 1
    }
  }, s.wizard), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, fmt(i + 1, lang), " / ", fmt(4, lang))), /*#__PURE__*/React.createElement("ol", {
    style: {
      display: 'flex',
      gap: 8,
      listStyle: 'none',
      margin: '0 0 24px',
      padding: 0
    }
  }, s.steps.map((st, k) => /*#__PURE__*/React.createElement("li", {
    key: st,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      height: 4,
      borderRadius: 999,
      background: k <= i ? 'var(--ink)' : 'var(--line-strong)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: k === i ? 600 : 500,
      color: k === i ? 'var(--text-body)' : 'var(--text-muted)'
    }
  }, st)))), /*#__PURE__*/React.createElement(Card, null, children), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: () => i ? setI(i - 1) : setStep('events')
  }, s.back), i < 3 ? /*#__PURE__*/React.createElement(Button, {
    iconEnd: "arrow-left",
    onClick: () => setI(i + 1)
  }, s.next) : /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    icon: "sparkles",
    onClick: () => setStep('events')
  }, s.finish)));
  if (i === 0) return /*#__PURE__*/React.createElement(Frame, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10
    }
  }, s.types.map(([ic, l], k) => /*#__PURE__*/React.createElement(ChoiceCard, {
    key: l,
    icon: ic,
    title: l,
    selected: type === k,
    onClick: () => setType(k)
  }))));
  if (i === 1) return /*#__PURE__*/React.createElement(Frame, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: s.f.name,
    required: true,
    style: {
      gridColumn: '1 / -1'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: ar ? 'زواج محمد ونورة' : 'Mohammed & Noura’s wedding'
  })), /*#__PURE__*/React.createElement(Field, {
    label: s.f.hosts,
    style: {
      gridColumn: '1 / -1'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: ar ? 'محمد ونورة' : 'Mohammed & Noura'
  })), /*#__PURE__*/React.createElement(Field, {
    label: s.f.date,
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    icon: "calendar",
    defaultValue: "2026-05-14"
  })), /*#__PURE__*/React.createElement(Field, {
    label: s.f.start,
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    icon: "clock",
    defaultValue: "20:30"
  })), /*#__PURE__*/React.createElement(Field, {
    label: s.f.city
  }, /*#__PURE__*/React.createElement(Select, {
    value: "ryd",
    options: [{
      value: 'ryd',
      label: ar ? 'الرياض' : 'Riyadh'
    }, {
      value: 'jed',
      label: ar ? 'جدة' : 'Jeddah'
    }, {
      value: 'dmm',
      label: ar ? 'الدمام' : 'Dammam'
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: s.f.venue
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: ar ? 'قاعة الماسة' : 'Al Masa Hall'
  })), /*#__PURE__*/React.createElement(Field, {
    label: s.f.map,
    style: {
      gridColumn: '1 / -1'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    icon: "map-pin",
    placeholder: "https://maps.app.goo.gl/\u2026"
  })), /*#__PURE__*/React.createElement(Field, {
    label: s.f.tz
  }, /*#__PURE__*/React.createElement(Select, {
    value: "ksa",
    options: [{
      value: 'ksa',
      label: ar ? 'الرياض (GMT+3)' : 'Riyadh (GMT+3)'
    }, {
      value: 'uae',
      label: ar ? 'دبي (GMT+4)' : 'Dubai (GMT+4)'
    }]
  }))));
  if (i === 2) return /*#__PURE__*/React.createElement(Frame, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: s.r.deadline,
    required: true,
    style: {
      maxWidth: 260
    }
  }, /*#__PURE__*/React.createElement(Input, {
    dir: "ltr",
    mono: true,
    icon: "calendar",
    defaultValue: "2026-05-10"
  })), /*#__PURE__*/React.createElement(Switch, {
    checked: true,
    label: s.r.edits,
    description: ar ? 'حتى موعد الإغلاق' : 'Until the deadline'
  }), /*#__PURE__*/React.createElement(Switch, {
    checked: true,
    label: s.r.auto,
    description: s.r.autoD
  }), /*#__PURE__*/React.createElement(Switch, {
    label: s.r.qr,
    description: s.r.qrD
  })));
  return /*#__PURE__*/React.createElement(Frame, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(Banner, {
    kind: ['neutral', 'warning', 'warning', 'info', 'success', 'danger'][wa],
    icon: "message-circle",
    title: `${s.wa}: ${s.waStates[wa][0]}`,
    description: wa === 4 ? ar ? 'القالب معتمد · رقم المرسل +966 11 200 0000' : 'Template approved · sender +966 11 200 0000' : wa === 5 ? ar ? 'سنعيد المحاولة تلقائيًا. لن تُرسل الدعوات حتى يعود الاتصال.' : 'We’ll retry automatically. Invitations won’t send until the connection returns.' : ar ? 'لن تحتاج إلى مصطلحات تقنية — اتبع الخطوات.' : 'No technical jargon needed — follow the steps.',
    actionLabel: wa < 4 ? s.connect : undefined,
    onAction: () => setWa(4)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap'
    }
  }, s.waStates.map(([l, tone], k) => /*#__PURE__*/React.createElement("button", {
    key: l,
    type: "button",
    onClick: () => setWa(k),
    style: {
      border: `1px solid ${k === wa ? 'var(--ink)' : 'var(--border-strong)'}`,
      background: k === wa ? 'var(--ink)' : 'var(--surface-card)',
      color: k === wa ? '#fff' : 'var(--text-secondary)',
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: 12,
      cursor: 'pointer',
      fontFamily: 'inherit'
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--border-default)',
      paddingTop: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, s.check.map((c, k) => {
    const ok = k === 0 || k === 3 || k === 2 && wa === 4;
    return /*#__PURE__*/React.createElement("div", {
      key: c,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 15
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: ok ? 'circle-check' : 'circle-dashed',
      size: 20,
      color: ok ? 'var(--accepted)' : 'var(--text-disabled)'
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        color: ok ? 'var(--text-body)' : 'var(--text-muted)'
      }
    }, c), k === 1 ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "secondary",
      icon: "plus"
    }, ar ? 'إضافة يدويًا' : 'Add manually'), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "secondary",
      icon: "upload"
    }, ar ? 'استيراد Excel' : 'Import Excel')) : null);
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, s.addGuests))));
}
function App() {
  const [lang, setLang] = React.useState('ar');
  const [step, setStep] = React.useState('signin');
  const s = S[lang];
  const ar = lang === 'ar';
  React.useEffect(() => {
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);
  return /*#__PURE__*/React.createElement("div", {
    dir: ar ? 'rtl' : 'ltr',
    style: {
      minHeight: '100%',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 16,
      insetInlineStart: 16,
      zIndex: 9,
      display: 'flex',
      gap: 6,
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 12,
      padding: 6,
      boxShadow: 'var(--shadow-raised)'
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    variant: "pill",
    value: step === 'dash' ? 'events' : step,
    onChange: setStep,
    items: [{
      id: 'signin',
      label: s.signin
    }, {
      id: 'otp',
      label: 'OTP'
    }, {
      id: 'events',
      label: s.events
    }, {
      id: 'wizard',
      label: s.wizard
    }]
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "languages",
    onClick: () => setLang(ar ? 'en' : 'ar')
  }, ar ? 'English' : 'العربية')), step === 'signin' || step === 'otp' ? /*#__PURE__*/React.createElement(Auth, {
    s: s,
    step: step,
    setStep: setStep,
    lang: lang
  }) : step === 'wizard' ? /*#__PURE__*/React.createElement(Wizard, {
    s: s,
    lang: lang,
    setStep: setStep
  }) : step === 'dash' ? /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(EmptyState, {
    icon: "layout-dashboard",
    title: ar ? 'لوحة المناسبة' : 'Event dashboard',
    description: ar ? 'انظر UI kit: Host dashboard' : 'See the Host dashboard UI kit',
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setStep('events')
    }, s.back)
  }))) : /*#__PURE__*/React.createElement(Events, {
    s: s,
    lang: lang,
    setStep: setStep
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/host-onboarding/onboarding.screen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/whatsapp/chat.screen.jsx
try { (() => {
const DS = window.DawahInvitationsDesignSystem_51e74b;
const {
  Icon,
  Button
} = DS;
const fmt = (n, lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-arab' : 'en-US').format(n);
const M = {
  ar: {
    sender: 'دعوة — زواج محمد ونورة',
    biz: 'حساب أعمال',
    hello: n => `مرحبًا ${n}،`,
    body: 'بمشيئة الله يسرّنا دعوتكم لحضور حفل زواج محمد ونورة.',
    when: 'الخميس ١٤ مايو ٢٠٢٦\n٨:٣٠ مساءً\nقاعة الماسة — الرياض',
    scope: {
      single: 'هذه الدعوة خاصة بك.',
      family: 'هذه الدعوة تشمل ٤ أشخاص: عبدالله، منيرة، خالد، ريم.',
      companions: 'هذه الدعوة لك ولمرافقَين اثنين على الأكثر.'
    },
    view: 'عرض الدعوة',
    btns: {
      single: [['سأحضر', 1], ['أعتذر', 0]],
      family: [['سيحضر الجميع', 4], ['اختيار الحاضرين', 'select'], ['يعتذر الجميع', 0]],
      companions: [['أنا فقط', 1], ['أنا + ١', 2], ['أنا + ٢', 3], ['أعتذر', 0]]
    },
    confirmed: n => `تم تأكيد حضورك.\n\nعدد الحاضرين: ${fmt(n, 'ar')} ${n === 1 ? 'شخص' : n === 2 ? 'شخصان' : 'أشخاص'}\n\nنتشرّف بحضوركم.`,
    declined: 'تم تسجيل اعتذارك. شكرًا لإبلاغنا.',
    selectMsg: 'اختر الحاضرين من صفحة صغيرة دون تسجيل دخول:',
    post: [['map-pin', 'عرض الموقع'], ['pencil-line', 'تغيير الرد'], ['qr-code', 'بطاقة الدخول']],
    postD: [['pencil-line', 'تغيير الرد']],
    names: {
      single: 'سارة',
      family: 'عائلة الدوسري',
      companions: 'محمد'
    },
    reset: 'إعادة',
    today: 'اليوم'
  },
  en: {
    sender: 'Dawah — Mohammed & Noura',
    biz: 'Business account',
    hello: n => `Hello ${n},`,
    body: 'We are pleased to invite you to the wedding of Mohammed & Noura.',
    when: 'Thursday 14 May 2026\n8:30 PM\nAl Masa Hall — Riyadh',
    scope: {
      single: 'This invitation is for you.',
      family: 'This invitation includes 4 people: Abdullah, Munira, Khalid, Reem.',
      companions: 'This invitation is for you and up to two companions.'
    },
    view: 'View invitation',
    btns: {
      single: [['I will attend', 1], ['Decline', 0]],
      family: [['Everyone attending', 4], ['Select attendees', 'select'], ['Everyone declines', 0]],
      companions: [['Me only', 1], ['Me + 1', 2], ['Me + 2', 3], ['Decline', 0]]
    },
    confirmed: n => `Your attendance has been confirmed.\n\nAttendees: ${n} ${n === 1 ? 'person' : 'people'}\n\nWe look forward to seeing you.`,
    declined: 'Your apology has been recorded. Thank you for letting us know.',
    selectMsg: 'Choose who is attending on a small page — no login needed:',
    post: [['map-pin', 'View location'], ['pencil-line', 'Change response'], ['qr-code', 'Entry pass']],
    postD: [['pencil-line', 'Change response']],
    names: {
      single: 'Sarah',
      family: 'Al-Dosari family',
      companions: 'Mohammed'
    },
    reset: 'Reset',
    today: 'Today'
  }
};
const Bubble = ({
  children,
  out,
  time
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    alignSelf: out ? 'flex-end' : 'flex-start',
    maxWidth: '86%',
    background: out ? 'var(--wa-bubble-out)' : 'var(--wa-bubble-in)',
    borderRadius: 10,
    padding: '8px 10px 6px',
    fontSize: 15,
    lineHeight: 1.55,
    color: '#111B21',
    boxShadow: '0 1px .5px rgba(0,0,0,.13)',
    whiteSpace: 'pre-line'
  }
}, children, /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: '#667781',
    marginTop: 4
  }
}, time, out ? /*#__PURE__*/React.createElement(Icon, {
  name: "check-check",
  size: 15,
  color: "var(--wa-tick)"
}) : null));
const QuickBtn = ({
  icon,
  label,
  onClick,
  disabled
}) => /*#__PURE__*/React.createElement("button", {
  type: "button",
  onClick: onClick,
  disabled: disabled,
  style: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    padding: '8px 12px',
    background: 'var(--wa-bubble-in)',
    border: 0,
    borderRadius: 10,
    color: disabled ? '#8696A0' : 'var(--wa-link)',
    fontSize: 15,
    fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
    boxShadow: '0 1px .5px rgba(0,0,0,.13)',
    fontFamily: 'inherit',
    width: '86%',
    alignSelf: 'flex-start'
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: icon,
  size: 17
}), label);
function Chat({
  type,
  lang
}) {
  const m = M[lang];
  const ar = lang === 'ar';
  const [reply, setReply] = React.useState(null);
  const t1 = ar ? '٧:٣٢ م' : '7:32 PM',
    t2 = ar ? '٧:٤٣ م' : '7:43 PM',
    t3 = ar ? '٧:٤٣ م' : '7:43 PM';
  return /*#__PURE__*/React.createElement("div", {
    dir: ar ? 'rtl' : 'ltr',
    className: "phone"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--wa-teal-dark)',
      color: '#fff',
      padding: '14px 14px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 20,
    flipRtl: true
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: 'var(--inv-cream)',
      color: 'var(--inv-deep)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontSize: 18
    }
  }, "\u062F"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, m.sender), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      opacity: .8,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "badge-check",
    size: 12
  }), m.biz)), /*#__PURE__*/React.createElement(Icon, {
    name: "ellipsis-vertical",
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      alignSelf: 'center',
      fontSize: 12,
      background: 'rgba(255,255,255,.85)',
      color: '#54656F',
      padding: '4px 10px',
      borderRadius: 8,
      marginBottom: 4
    }
  }, m.today), /*#__PURE__*/React.createElement(Bubble, {
    time: t1
  }, /*#__PURE__*/React.createElement("b", null, m.hello(m.names[type])), '\n', m.body, '\n\n', /*#__PURE__*/React.createElement("b", null, m.when), '\n\n', m.scope[type]), /*#__PURE__*/React.createElement(QuickBtn, {
    icon: "external-link",
    label: m.view
  }), m.btns[type].map(([l, v]) => /*#__PURE__*/React.createElement(QuickBtn, {
    key: l,
    icon: "reply",
    label: l,
    disabled: reply !== null && reply.l !== l,
    onClick: () => setReply({
      l,
      v
    })
  })), reply ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Bubble, {
    out: true,
    time: t2
  }, reply.l), reply.v === 'select' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Bubble, {
    time: t3
  }, m.selectMsg), /*#__PURE__*/React.createElement(QuickBtn, {
    icon: "external-link",
    label: ar ? 'اختيار الحاضرين' : 'Select attendees'
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Bubble, {
    time: t3
  }, reply.v === 0 ? m.declined : m.confirmed(reply.v)), (reply.v === 0 ? m.postD : m.post).map(([ic, l]) => /*#__PURE__*/React.createElement(QuickBtn, {
    key: l,
    icon: ic,
    label: l
  })))) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 10px 14px',
      background: '#F0F2F5'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 40,
      borderRadius: 20,
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      color: '#8696A0',
      fontSize: 14
    }
  }, ar ? 'رسالة' : 'Message'), reply ? /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    onClick: () => setReply(null)
  }, m.reset) : /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'var(--wa-teal)',
      color: '#fff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "mic",
    size: 18
  }))));
}
function App() {
  const [lang, setLang] = React.useState('ar');
  const ar = lang === 'ar';
  return /*#__PURE__*/React.createElement("div", {
    dir: ar ? 'rtl' : 'ltr'
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--text-secondary)'
    }
  }, ar ? 'اضغط زر ردّ لرؤية رسالة التأكيد' : 'Tap a reply button to see the acknowledgement'), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "languages",
    onClick: () => setLang(ar ? 'en' : 'ar')
  }, ar ? 'English' : 'العربية')), /*#__PURE__*/React.createElement("div", {
    className: "phones"
  }, ['single', 'family', 'companions'].map(tp => /*#__PURE__*/React.createElement(Chat, {
    key: tp + lang,
    type: tp,
    lang: lang
  }))));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/whatsapp/chat.screen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Funnel = __ds_scope.Funnel;

__ds_ns.Num = __ds_scope.Num;

__ds_ns.Phone = __ds_scope.Phone;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.STATUS = __ds_scope.STATUS;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Timeline = __ds_scope.Timeline;

__ds_ns.Banner = __ds_scope.Banner;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.ChoiceCard = __ds_scope.ChoiceCard;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.PhoneInput = __ds_scope.PhoneInput;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.Switch = __ds_scope.Switch;

})();
