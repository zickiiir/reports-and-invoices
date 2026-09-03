import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  pgEnum,
  pgTableCreator,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Multi-project schema feature of Drizzle ORM — all tables get a prefix, so this can
 * share a DB instance with other projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `reports_and_invoices_${name}`);

export const userRoleEnum = pgEnum("reports_and_invoices_user_role", [
  "super_user",
  "senior_programmer",
  "developer",
]);

// Derived from the same enum as `userRoleEnum` — safe to import from client
// components too (unlike `~/server/auth/config`, which pulls in the `postgres`
// client via `~/server/db`, unusable in the browser).
export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const invoiceStatusEnum = pgEnum("reports_and_invoices_invoice_status", [
  "draft",
  "issued",
  "paid",
]);

export const editorKeybindingEnum = pgEnum(
  "reports_and_invoices_editor_keybinding",
  ["emacs", "vim"],
);
export type EditorKeybinding = (typeof editorKeybindingEnum.enumValues)[number];

// Values correspond directly to Mantine's `useMantineColorScheme()` (`auto` = follow
// the system), so nothing needs translating between the DB and UI layers.
export const colorSchemeEnum = pgEnum("reports_and_invoices_color_scheme", [
  "auto",
  "light",
  "dark",
]);
export type ColorSchemePreference = (typeof colorSchemeEnum.enumValues)[number];

export const cursorStyleEnum = pgEnum("reports_and_invoices_cursor_style", [
  "line",
  "block",
]);
export type CursorStyle = (typeof cursorStyleEnum.enumValues)[number];

// "month" = separate numbering sequence for each performance month (the existing/
// default behavior), "year" = a single continuous sequence for the whole year
// regardless of month (an older established practice predating the app). See
// src/server/invoicing/numbering.ts.
export const invoiceNumberingScopeEnum = pgEnum(
  "reports_and_invoices_invoice_numbering_scope",
  ["month", "year"],
);
export type InvoiceNumberingScope = (typeof invoiceNumberingScopeEnum.enumValues)[number];

// A curated selection from Mantine's default color scale — used as `primaryColor`
// in the theme (see src/app/theme-provider.tsx).
export const primaryColorEnum = pgEnum("reports_and_invoices_primary_color", [
  "blue",
  "indigo",
  "violet",
  "grape",
  "pink",
  "red",
  "orange",
  "teal",
  "green",
]);
export type PrimaryColor = (typeof primaryColorEnum.enumValues)[number];

/**
 * Application users = "suppliers". Authentication via NextAuth Credentials
 * (email + password), JWT session — no next-auth DB adapter/tables.
 *
 * Roles and hierarchy:
 * - super_user: sees and manages absolutely everything
 * - senior_programmer: own timesheets/customers/invoices + read-only access to
 *   subordinates' timesheets (users.managerId → their id)
 * - developer: only their own timesheets/customers/invoices
 */
export const users = createTable("user", (d) => ({
  id: d
    .uuid()
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: d.varchar({ length: 255 }).notNull().unique(),
  passwordHash: d.varchar({ length: 255 }).notNull(),
  // "Name / company" — the supplier's display and invoicing name, can be a company
  // name too (not necessarily a person), see settings-form.tsx. Independent of
  // firstName/lastName below (those are just for the admin user overview/account creation).
  name: d.varchar({ length: 255 }).notNull(),
  // Structured person name — filled in when the account is created (see user.create),
  // optional (root/older accounts may not have it), the admin overview falls back to
  // "name" above when missing.
  firstName: d.varchar({ length: 100 }),
  lastName: d.varchar({ length: 100 }),
  role: userRoleEnum().notNull().default("developer"),
  managerId: d
    .uuid()
    .references((): AnyPgColumn => users.id, { onDelete: "set null" }),

  // supplier's invoicing details
  street: d.varchar({ length: 255 }),
  city: d.varchar({ length: 255 }),
  zip: d.varchar({ length: 20 }),
  ico: d.varchar({ length: 20 }),
  dic: d.varchar({ length: 20 }),
  phone: d.varchar({ length: 50 }),
  invoiceEmail: d.varchar({ length: 255 }),
  bankAccount: d.varchar({ length: 50 }),
  bankCode: d.varchar({ length: 10 }),
  signatureImageUrl: d.text(),

  // rules for pre-filling invoice dates, see src/server/invoicing/dates.ts
  invoiceDateRules: d.jsonb().$type<InvoiceDateRules>(),
  // Invoice numbering — per performance month, or per whole year (regardless of
  // month). See src/server/invoicing/numbering.ts.
  invoiceNumberingScope: invoiceNumberingScopeEnum().notNull().default("month"),
  // Default invoice line-item description template for newly created customers/
  // aliases, "{alias}" gets replaced with the actual alias. Null = use the built-in default.
  defaultLineItemTemplate: d.varchar({ length: 255 }),
  // Base hourly rate for newly created customers, when their own isn't filled in.
  defaultHourlyRate: d.numeric({ precision: 10, scale: 2 }),
  // Keyboard shortcuts in the timesheet editor (CodeMirror keymap).
  editorKeybinding: editorKeybindingEnum().notNull().default("emacs"),
  // Cursor style in the timesheet editor (thin line vs. block).
  cursorStyle: cursorStyleEnum().notNull().default("line"),
  // Show line numbers in the timesheet editor.
  showLineNumbers: d.boolean().notNull().default(true),
  // Preferred color scheme for the app, synced with Mantine's color scheme manager
  // (localStorage) after login — see the sync effect in nav-shell.tsx.
  colorScheme: colorSchemeEnum().notNull().default("auto"),
  // Mantine theme's primary color, synced the same way as colorScheme.
  primaryColor: primaryColorEnum().notNull().default("blue"),

  // "Minimum workload" — for the homepage widget (see src/server/timesheet/workload.ts),
  // which compares hours worked against a target derived from these days/hours. ISO
  // weekdays (1=Monday..7=Sunday), default = a regular Mon-Fri work week.
  workdays: d.jsonb().$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  hoursPerWorkday: d.numeric({ precision: 4, scale: 2 }).notNull().default("8"),
  // Custom (lower) monthly hours goal — when less than the "achievable maximum"
  // (workdays × hoursPerWorkday) is enough. Null = use that maximum directly. When
  // set, the weekly pace is recalculated from it (see workload.ts).
  monthlyHoursGoal: d.numeric({ precision: 6, scale: 2 }),

  // Timesheet sync to Nextcloud via WebDAV (see src/server/nextcloud/) — an
  // alternative to a local folder (File System Access API, Chrome/Edge only), works
  // in any browser since it runs server-side. The password is always a Nextcloud
  // "app password" (not the main one), encrypted at rest — see nextcloud/crypto.ts.
  nextcloudUrl: d.varchar({ length: 500 }),
  nextcloudUsername: d.varchar({ length: 255 }),
  nextcloudAppPasswordEnc: d.text(),
  nextcloudRemotePath: d.varchar({ length: 500 }),
  // Periods (YYYYMM) the app has already written to Nextcloud itself — on the first
  // write of a given period, it first checks via WebDAV whether a file with the same
  // name already exists (so the app doesn't overwrite a foreign/manually-uploaded
  // file); after the first successful write it's "ours" and further syncs overwrite it
  // without asking. See nextcloud/sync.ts.
  nextcloudSyncedPeriods: d.jsonb().$type<string[]>(),

  createdAt: d
    .timestamp({ withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
}));

export type DateRule =
  | { type: "lastDayOfPeriodMonth" }
  | { type: "dayOfNextMonth"; day: number };

export type InvoiceDateRules = {
  issue: DateRule;
  due: DateRule;
  performance: DateRule;
};

export const usersRelations = relations(users, ({ one, many }) => ({
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager",
  }),
  subordinates: many(users, { relationName: "manager" }),
  payers: many(payers),
  customers: many(customers),
  invoices: many(invoices),
}));

/**
 * Payer (the actual invoicing party, the recipient shown on the invoice). One payer
 * can cover several timesheet aliases — e.g. AC1/AC2/AC3 might all be invoiced to a
 * single payer "Acme Software s.r.o.", because one parent entity pays for them.
 */
export const payers = createTable(
  "payer",
  (d) => ({
    id: d
      .uuid()
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyName: d.varchar({ length: 255 }).notNull(),
    street: d.varchar({ length: 255 }),
    city: d.varchar({ length: 255 }),
    zip: d.varchar({ length: 20 }),
    ico: d.varchar({ length: 20 }),
    dic: d.varchar({ length: 20 }),
    archived: d.boolean().notNull().default(false),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index("payer_user_idx").on(t.userId)],
);

export const payersRelations = relations(payers, ({ one, many }) => ({
  user: one(users, { fields: [payers.userId], references: [users.id] }),
  customers: many(customers),
  invoices: many(invoices),
}));

/**
 * Customer/alias from the timesheet (AC1, BETA, GAMMA, ...) — a unit of work with its
 * own hourly rate, belonging to some payer who actually invoices and pays for it.
 */
export const customers = createTable(
  "customer",
  (d) => ({
    id: d
      .uuid()
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payerId: d
      .uuid()
      .notNull()
      .references(() => payers.id, { onDelete: "restrict" }),
    alias: d.varchar({ length: 64 }).notNull(),
    defaultHourlyRate: d.numeric({ precision: 10, scale: 2 }),
    defaultLineItemText: d.varchar({ length: 255 }),
    archived: d.boolean().notNull().default(false),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    unique("customer_user_alias_unique").on(t.userId, t.alias),
    index("customer_user_idx").on(t.userId),
    index("customer_payer_idx").on(t.payerId),
  ],
);

export const customersRelations = relations(customers, ({ one }) => ({
  user: one(users, { fields: [customers.userId], references: [users.id] }),
  payer: one(payers, { fields: [customers.payerId], references: [payers.id] }),
}));

export const invoices = createTable(
  "invoice",
  (d) => ({
    id: d
      .uuid()
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payerId: d
      .uuid()
      .notNull()
      .references(() => payers.id, { onDelete: "restrict" }),
    number: d.varchar({ length: 20 }).notNull(),
    variableSymbol: d.varchar({ length: 30 }),
    constantSymbol: d.varchar({ length: 30 }),
    issueDate: d.date(),
    dueDate: d.date(),
    performanceDate: d.date(),
    periodLabel: d.varchar({ length: 32 }),
    sourceYear: d.integer(),
    sourceMonth: d.integer(),
    status: invoiceStatusEnum().notNull().default("draft"),
    currency: d.varchar({ length: 3 }).notNull().default("CZK"),
    totalAmount: d.numeric({ precision: 12, scale: 2 }).notNull().default("0"),
    note: d.text(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    unique("invoice_user_number_unique").on(t.userId, t.number),
    index("invoice_user_idx").on(t.userId),
    index("invoice_payer_idx").on(t.payerId),
  ],
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, { fields: [invoices.userId], references: [users.id] }),
  payer: one(payers, {
    fields: [invoices.payerId],
    references: [payers.id],
  }),
  items: many(invoiceItems),
}));

export const invoiceItems = createTable(
  "invoice_item",
  (d) => ({
    id: d
      .uuid()
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    invoiceId: d
      .uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: d.integer().notNull().default(0),
    name: d.varchar({ length: 500 }).notNull(),
    quantity: d.numeric({ precision: 10, scale: 2 }).notNull().default("1"),
    unitPrice: d.numeric({ precision: 10, scale: 2 }).notNull().default("0"),
    discount: d.numeric({ precision: 10, scale: 2 }).notNull().default("0"),
    vatRate: d.numeric({ precision: 5, scale: 2 }).notNull().default("0"),
    total: d.numeric({ precision: 12, scale: 2 }).notNull().default("0"),
  }),
  (t) => [index("invoice_item_invoice_idx").on(t.invoiceId)],
);

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

/**
 * Replaces the old log files (logs/invoicesXX20YY.log) for deriving the next invoice
 * number. Invoice number = `${period}${lastSequence + 1, padded to 2 digits}`.
 */
export const invoiceNumberCounters = createTable(
  "invoice_number_counter",
  (d) => ({
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    period: d.varchar({ length: 6 }).notNull(),
    lastSequence: d.integer().notNull().default(0),
  }),
  (t) => [unique("invoice_number_counter_unique").on(t.userId, t.period)],
);
