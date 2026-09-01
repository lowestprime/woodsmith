export const NOTIFICATION_RECIPIENT_MODES = [
  "request",
  "configured",
  "request-and-configured"
] as const;

export type NotificationRecipientMode =
  (typeof NOTIFICATION_RECIPIENT_MODES)[number];

export const NOTIFICATION_TYPE_KEYS = [
  "account_verification",
  "account_created_admin",
  "password_reset",
  "commission_submitted",
  "project_status",
  "order_status",
  "invoice",
  "shipping",
  "visitor_session",
  "studio_test"
] as const;

export type NotificationTypeKey =
  (typeof NOTIFICATION_TYPE_KEYS)[number];

export type NotificationTypeDefinition = {
  key: NotificationTypeKey;
  label: string;
  description: string;
  enabled: boolean;
  recipientMode: NotificationRecipientMode;
  retentionDays: number;
  maxAttempts: number;
  retryBaseSeconds: number;
  variables: readonly string[];
  subjectTemplate: string;
  textTemplate: string;
  htmlTemplate: string;
};

const COMMON_VARIABLES = [
  "siteName",
  "recipient",
  "recipientName"
] as const;

export const DEFAULT_NOTIFICATION_TYPES:
  readonly NotificationTypeDefinition[] = [
    {
      key: "account_verification",
      label: "Email verification",
      description:
        "Confirms a new or updated buyer email address.",
      enabled: true,
      recipientMode: "request",
      retentionDays: 14,
      maxAttempts: 3,
      retryBaseSeconds: 300,
      variables: [
        ...COMMON_VARIABLES,
        "actionUrl",
        "expiresIn"
      ],
      subjectTemplate:
        "Confirm your {{siteName}} email",
      textTemplate:
        "Welcome to {{siteName}}.\n\nConfirm your email address:\n{{actionUrl}}\n\nThis link expires in {{expiresIn}}.",
      htmlTemplate:
        "<p>Welcome to <strong>{{siteName}}</strong>.</p><p>Confirm your email address:</p><p>{{actionUrl}}</p><p>This link expires in {{expiresIn}}.</p>"
    },
    {
      key: "account_created_admin",
      label: "New account notice",
      description:
        "Notifies configured woodshop recipients when a buyer account is created.",
      enabled: true,
      recipientMode: "request-and-configured",
      retentionDays: 90,
      maxAttempts: 3,
      retryBaseSeconds: 300,
      variables: [
        ...COMMON_VARIABLES,
        "displayName",
        "email",
        "createdAt"
      ],
      subjectTemplate:
        "New account: {{displayName}}",
      textTemplate:
        "A new customer account was created.\n\nName: {{displayName}}\nEmail: {{email}}\nAt: {{createdAt}}",
      htmlTemplate:
        "<p>A new customer account was created.</p><p><strong>Name:</strong> {{displayName}}<br><strong>Email:</strong> {{email}}<br><strong>At:</strong> {{createdAt}}</p>"
    },
    {
      key: "password_reset",
      label: "Password reset",
      description:
        "Sends the time-limited buyer password-reset link.",
      enabled: true,
      recipientMode: "request",
      retentionDays: 7,
      maxAttempts: 3,
      retryBaseSeconds: 180,
      variables: [
        ...COMMON_VARIABLES,
        "actionUrl",
        "expiresIn"
      ],
      subjectTemplate:
        "Reset your {{siteName}} password",
      textTemplate:
        "Use this link to reset your password:\n{{actionUrl}}\n\nThis link expires in {{expiresIn}}.",
      htmlTemplate:
        "<p>Use this link to reset your password:</p><p>{{actionUrl}}</p><p>This link expires in {{expiresIn}}.</p>"
    },
    {
      key: "commission_submitted",
      label: "Custom request received",
      description:
        "Confirms a new custom-work request and its private reference.",
      enabled: true,
      recipientMode: "request-and-configured",
      retentionDays: 365,
      maxAttempts: 4,
      retryBaseSeconds: 300,
      variables: [
        ...COMMON_VARIABLES,
        "projectReference",
        "statusUrl"
      ],
      subjectTemplate:
        "Custom work request received: {{projectReference}}",
      textTemplate:
        "Your {{siteName}} project reference is {{projectReference}}. Open {{statusUrl}} and enter the reference with your email to view updates.",
      htmlTemplate:
        "<p>Your {{siteName}} project reference is <strong>{{projectReference}}</strong>.</p><p>Open {{statusUrl}} and enter the reference with your email to view updates.</p>"
    },
    {
      key: "project_status",
      label: "Project status",
      description:
        "Sends a buyer-facing project status and stage update.",
      enabled: true,
      recipientMode: "request",
      retentionDays: 365,
      maxAttempts: 4,
      retryBaseSeconds: 300,
      variables: [
        ...COMMON_VARIABLES,
        "projectReference",
        "status",
        "stage",
        "statusUrl"
      ],
      subjectTemplate:
        "Project update: {{projectReference}}",
      textTemplate:
        "Your project {{projectReference}} is currently marked {{status}} / {{stage}}. View the project at {{statusUrl}}.",
      htmlTemplate:
        "<p>Your project <strong>{{projectReference}}</strong> is currently marked <strong>{{status}}</strong> / <strong>{{stage}}</strong>.</p><p>View the project at {{statusUrl}}.</p>"
    },
    {
      key: "order_status",
      label: "Order status",
      description:
        "Communicates payment, preparation, and delivery status.",
      enabled: true,
      recipientMode: "request",
      retentionDays: 730,
      maxAttempts: 4,
      retryBaseSeconds: 300,
      variables: [
        ...COMMON_VARIABLES,
        "orderNumber",
        "status",
        "trackingNumber"
      ],
      subjectTemplate:
        "Order update: {{orderNumber}}",
      textTemplate:
        "Order {{orderNumber}} is now {{status}}. Tracking: {{trackingNumber}}",
      htmlTemplate:
        "<p>Order <strong>{{orderNumber}}</strong> is now <strong>{{status}}</strong>.</p><p>Tracking: {{trackingNumber}}</p>"
    },
    {
      key: "invoice",
      label: "Invoice",
      description:
        "Sends an invoice notice after an invoice is issued.",
      enabled: true,
      recipientMode: "request",
      retentionDays: 2555,
      maxAttempts: 4,
      retryBaseSeconds: 300,
      variables: [
        ...COMMON_VARIABLES,
        "orderNumber",
        "invoiceUrl"
      ],
      subjectTemplate:
        "Invoice for {{orderNumber}}",
      textTemplate:
        "Your invoice for {{orderNumber}} is available at {{invoiceUrl}}.",
      htmlTemplate:
        "<p>Your invoice for <strong>{{orderNumber}}</strong> is available at {{invoiceUrl}}.</p>"
    },
    {
      key: "shipping",
      label: "Shipment",
      description:
        "Sends carrier and tracking information after dispatch.",
      enabled: true,
      recipientMode: "request",
      retentionDays: 730,
      maxAttempts: 4,
      retryBaseSeconds: 300,
      variables: [
        ...COMMON_VARIABLES,
        "orderNumber",
        "carrier",
        "trackingNumber"
      ],
      subjectTemplate:
        "Shipment update: {{orderNumber}}",
      textTemplate:
        "Order {{orderNumber}} has shipped with {{carrier}}. Tracking: {{trackingNumber}}",
      htmlTemplate:
        "<p>Order <strong>{{orderNumber}}</strong> has shipped with {{carrier}}.</p><p>Tracking: {{trackingNumber}}</p>"
    },
    {
      key: "visitor_session",
      label: "New visitor session",
      description:
        "Optionally notifies configured woodshop recipients when a new browser session is first recorded.",
      enabled: false,
      recipientMode: "request",
      retentionDays: 30,
      maxAttempts: 1,
      retryBaseSeconds: 300,
      variables: [
        ...COMMON_VARIABLES,
        "path",
        "country",
        "city",
        "region",
        "host",
        "firstSeenAt"
      ],
      subjectTemplate:
        "New visitor to {{siteName}}: {{country}}",
      textTemplate:
        "A new visitor session was recorded.\n\nPath: {{path}}\nCountry: {{country}}\nCity: {{city}}\nRegion: {{region}}\nHost: {{host}}\nAt: {{firstSeenAt}}",
      htmlTemplate:
        "<p>A new visitor session was recorded.</p><ul><li><strong>Path:</strong> {{path}}</li><li><strong>Country:</strong> {{country}}</li><li><strong>City:</strong> {{city}}</li><li><strong>Region:</strong> {{region}}</li><li><strong>Host:</strong> {{host}}</li><li><strong>At:</strong> {{firstSeenAt}}</li></ul>"
    },
    {
      key: "studio_test",
      label: "SMTP test",
      description:
        "Authenticated test delivery from the Notifications workspace.",
      enabled: true,
      recipientMode: "request",
      retentionDays: 30,
      maxAttempts: 1,
      retryBaseSeconds: 60,
      variables: [
        ...COMMON_VARIABLES,
        "sentAt"
      ],
      subjectTemplate:
        "{{siteName}} SMTP test",
      textTemplate:
        "This authenticated SMTP test was requested from the woodshop dashboard at {{sentAt}}.",
      htmlTemplate:
        "<p>This authenticated SMTP test was requested from the woodshop dashboard at <strong>{{sentAt}}</strong>.</p>"
    }
  ];

const PLACEHOLDER_PATTERN =
  /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;

const SAFE_HTML_TAG_PATTERN =
  /^<\/?(?:p|strong|em|ul|ol|li)>$|^<br\s*\/?\s*>$/i;

function byteLength(value: string) {
  return new TextEncoder()
    .encode(value)
    .byteLength;
}

export function notificationTypeDefinition(
  key: string
) {
  return DEFAULT_NOTIFICATION_TYPES
    .find((definition) =>
      definition.key === key
    ) ?? null;
}

export function notificationTemplateVariables(
  key: string
) {
  return new Set(
    notificationTypeDefinition(key)
      ?.variables ??
      COMMON_VARIABLES
  );
}

export function extractNotificationPlaceholders(
  value: string
) {
  return [
    ...value.matchAll(
      PLACEHOLDER_PATTERN
    )
  ].map((match) => match[1]);
}

export function validateNotificationTemplate(
  input: {
    category: string;
    subjectTemplate: string;
    textTemplate: string;
    htmlTemplate: string;
  }
) {
  const errors: string[] = [];
  const allowed =
    notificationTemplateVariables(
      input.category
    );

  if (
    !input.subjectTemplate.trim()
  ) {
    errors.push(
      "Subject template is required."
    );
  }

  if (!input.textTemplate.trim()) {
    errors.push(
      "Text template is required."
    );
  }

  if (
    byteLength(
      input.subjectTemplate
    ) > 500
  ) {
    errors.push(
      "Subject template is too long."
    );
  }

  if (
    byteLength(
      input.textTemplate
    ) > 100_000 ||
    byteLength(
      input.htmlTemplate
    ) > 200_000
  ) {
    errors.push(
      "Notification template body is too long."
    );
  }

  const combined = [
    input.subjectTemplate,
    input.textTemplate,
    input.htmlTemplate
  ];

  for (const value of combined) {
    if (
      value.includes("{{{") ||
      value.includes("}}}")
    ) {
      errors.push(
        "Triple-brace template expressions are not allowed."
      );
    }

    for (
      const placeholder of
      extractNotificationPlaceholders(
        value
      )
    ) {
      if (!allowed.has(placeholder)) {
        errors.push(
          `Unknown {{${placeholder}}} placeholder for this notification type.`
        );
      }
    }
  }

  const htmlWithoutPlaceholders =
    input.htmlTemplate.replace(
      PLACEHOLDER_PATTERN,
      ""
    );

  for (
    const tag of
    htmlWithoutPlaceholders.match(
      /<[^>]*>/g
    ) ?? []
  ) {
    if (!SAFE_HTML_TAG_PATTERN.test(tag)) {
      errors.push(
        "HTML templates may use only p, br, strong, em, ul, ol, and li tags without attributes."
      );
      break;
    }
  }

  if (
    /<|>/.test(
      htmlWithoutPlaceholders.replace(
        /<[^>]*>/g,
        ""
      )
    )
  ) {
    errors.push(
      "HTML template contains an incomplete or unsupported tag."
    );
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)]
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTemplateValue(
  template: string,
  variables: Record<
    string,
    string | number | null | undefined
  >,
  html: boolean
) {
  return template.replace(
    PLACEHOLDER_PATTERN,
    (_match, key: string) => {
      const value = String(
        variables[key] ?? ""
      );

      return html
        ? escapeHtml(value)
        : value;
    }
  );
}

export function renderNotificationTemplate(
  input: {
    category: string;
    subjectTemplate: string;
    textTemplate: string;
    htmlTemplate: string;
    variables: Record<
      string,
      string | number | null | undefined
    >;
  }
) {
  const validation =
    validateNotificationTemplate(
      input
    );

  if (!validation.ok) {
    throw new Error(
      validation.errors.join(" ")
    );
  }

  const subject =
    renderTemplateValue(
      input.subjectTemplate,
      input.variables,
      false
    )
      .replace(/[\r\n]+/g, " ")
      .trim();

  const text =
    renderTemplateValue(
      input.textTemplate,
      input.variables,
      false
    ).trim();

  const html =
    input.htmlTemplate.trim()
      ? renderTemplateValue(
          input.htmlTemplate,
          input.variables,
          true
        ).trim()
      : "";

  if (!subject || !text) {
    throw new Error(
      "Rendered notification subject and text must not be empty."
    );
  }

  return {
    subject,
    text,
    html
  };
}
