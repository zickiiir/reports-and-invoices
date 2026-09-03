"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Card,
  Chip,
  ColorSwatch,
  Divider,
  Grid,
  Group,
  Image,
  InputBase,
  List,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { Dropzone, IMAGE_MIME_TYPE } from "@mantine/dropzone";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconPhoto,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { IMaskInput } from "react-imask";
import { z } from "zod";

import { PRIMARY_COLOR_OPTIONS, usePrimaryColor } from "~/app/primary-color";
import { generatePassword, PASSWORD_CHECKS } from "~/lib/password-policy";
import { NextcloudSyncModal } from "./nextcloud-sync-modal";
import {
  clearSyncDirectory,
  getSyncDirectoryHandle,
  hasSyncPermission,
  isLocalSyncSupported,
  pickSyncDirectory,
  requestSyncPermission,
  writeFileToSyncDirectory,
} from "~/components/local-sync";
import { type DateRule } from "~/server/db/schema";
import { defaultInvoiceDateRules } from "~/server/invoicing/dates";
import { DEFAULT_LINE_ITEM_TEMPLATE } from "~/server/invoicing/line-item";
import { suggestedFilename } from "~/server/timesheet/filename";
import { api, type RouterOutputs } from "~/trpc/react";

type Me = RouterOutputs["user"]["me"];

const RULE_MODE_OPTIONS = [
  { value: "lastDay", label: "Poslední den vykazovaného měsíce" },
  { value: "day", label: "Konkrétní den v následujícím měsíci" },
];

// ISO weekdays (1=Monday..7=Sunday), same order as `users.workdays`.
const WEEKDAY_OPTIONS = [
  { value: "1", label: "Po" },
  { value: "2", label: "Út" },
  { value: "3", label: "St" },
  { value: "4", label: "Čt" },
  { value: "5", label: "Pá" },
  { value: "6", label: "So" },
  { value: "7", label: "Ne" },
];

const MONTH_OPTIONS = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
].map((label, i) => ({ value: String(i + 1), label }));

function ruleToForm(rule: DateRule): { mode: "lastDay" | "day"; day: number } {
  return rule.type === "dayOfNextMonth"
    ? { mode: "day", day: rule.day }
    : { mode: "lastDay", day: 15 };
}

function formToRule(mode: "lastDay" | "day", day: number): DateRule {
  return mode === "day"
    ? { type: "dayOfNextMonth", day }
    : { type: "lastDayOfPeriodMonth" };
}

/**
 * A small zod adapter for `useForm({ validate })` — without installing a separate
 * `mantine-form-zod-resolver` package, `zod` is already a dependency anyway (see the
 * server routers).
 */
function zodValidator<Schema extends z.ZodTypeAny>(schema: Schema) {
  return (values: z.input<Schema>) => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      errors[path] ??= issue.message;
    }
    return errors;
  };
}

const profileSchema = z.object({
  name: z.string().min(1, "Povinné pole"),
  street: z.string(),
  city: z.string(),
  zip: z.string().refine((v) => !v || /^\d{3} ?\d{2}$/.test(v), {
    message: "Formát PSČ: 123 45",
  }),
  ico: z.string().refine((v) => !v || /^\d{8}$/.test(v), {
    message: "IČ musí mít 8 číslic",
  }),
  dic: z.string().refine((v) => !v || /^CZ\d{8,10}$/i.test(v), {
    message: "Formát DIČ: CZ12345678",
  }),
  phone: z.string(),
  invoiceEmail: z.string().email("Neplatný email").optional().or(z.literal("")),
  bankAccount: z.string().refine((v) => !v || /^\d{1,6}-?\d{1,10}$/.test(v), {
    message: "Formát: [předčíslí-]číslo účtu",
  }),
  bankCode: z.string().refine((v) => !v || /^\d{4}$/.test(v), {
    message: "Kód banky musí mít 4 číslice",
  }),
});

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SettingsForm({ me }: { me: Me }) {
  const utils = api.useUtils();
  const [signaturePreview, setSignaturePreview] = useState(
    me.signatureImageUrl ?? "",
  );

  // `isLocalSyncSupported()` reads `window` — always false on the server. If it were
  // called directly during render, the server (false) and a Chrome client (true) would
  // disagree → hydration mismatch. We keep the first render always false (like the
  // server) and correct it in an effect.
  const [syncSupported, setSyncSupported] = useState(false);
  const [syncDirName, setSyncDirName] = useState<string | null>(null);
  const [syncGranted, setSyncGranted] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    // Detecting the browser API only works client-side, after hydration — unavoidable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncSupported(isLocalSyncSupported());
  }, []);

  useEffect(() => {
    if (!syncSupported) return;
    void (async () => {
      const handle = await getSyncDirectoryHandle();
      if (!handle) return;
      setSyncDirName(handle.name);
      setSyncGranted(await hasSyncPermission());
    })();
  }, [syncSupported]);

  const runFullSync = async () => {
    setSyncBusy(true);
    try {
      const periods = await utils.timesheet.listPeriods.fetch({ userId: me.id });
      let count = 0;
      for (const period of periods) {
        const { content } = await utils.timesheet.read.fetch({ userId: me.id, period });
        if (await writeFileToSyncDirectory(suggestedFilename(period), content)) count++;
      }
      notifications.show({
        color: "green",
        message: `Synchronizováno ${count} ${count === 1 ? "výkaz" : "výkazů"} do složky.`,
      });
    } catch {
      notifications.show({ color: "red", message: "Synchronizace selhala." });
    } finally {
      setSyncBusy(false);
    }
  };

  const handlePickSyncDirectory = async () => {
    try {
      const handle = await pickSyncDirectory();
      setSyncDirName(handle.name);
      setSyncGranted(true);
      await runFullSync();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        notifications.show({ color: "red", message: "Výběr složky selhal." });
      }
    }
  };

  const handleRequestSyncPermission = async () => {
    setSyncGranted(await requestSyncPermission());
  };

  const handleClearSync = async () => {
    await clearSyncDirectory();
    setSyncDirName(null);
    setSyncGranted(false);
  };

  const nextcloudStatus = api.nextcloud.status.useQuery();
  const [nextcloudSyncModalOpened, setNextcloudSyncModalOpened] = useState(false);
  const nextcloudForm = useForm({
    initialValues: { url: "", username: "", appPassword: "", remotePath: "/Vykazy" },
  });
  const nextcloudConnect = api.nextcloud.connect.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Nextcloud připojen." });
      nextcloudForm.reset();
      await utils.nextcloud.status.invalidate();
      // Offer the sync preview right away, so the user sees what will be written/conflict.
      setNextcloudSyncModalOpened(true);
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const nextcloudDisconnect = api.nextcloud.disconnect.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Nextcloud odpojen." });
      await utils.nextcloud.status.invalidate();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const updateColorScheme = api.user.updateColorScheme.useMutation({
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const { primaryColor, setPrimaryColor } = usePrimaryColor();

  const profileForm = useForm({
    initialValues: {
      name: me.name,
      street: me.street ?? "",
      city: me.city ?? "",
      zip: me.zip ?? "",
      ico: me.ico ?? "",
      dic: me.dic ?? "",
      phone: me.phone ?? "",
      invoiceEmail: me.invoiceEmail ?? "",
      bankAccount: me.bankAccount ?? "",
      bankCode: me.bankCode ?? "",
    },
    validate: zodValidator(profileSchema),
  });

  const rules = me.invoiceDateRules ?? defaultInvoiceDateRules;
  const dateRulesForm = useForm({
    initialValues: {
      issue: ruleToForm(rules.issue),
      due: ruleToForm(rules.due),
      performance: ruleToForm(rules.performance),
    },
  });

  const lineItemForm = useForm({
    initialValues: { template: me.defaultLineItemTemplate ?? "" },
  });

  const hourlyRateForm = useForm({
    initialValues: {
      rate: me.defaultHourlyRate ? Number(me.defaultHourlyRate) : "",
    },
  });

  const workloadForm = useForm({
    initialValues: {
      workdays: me.workdays.map(String),
      hoursPerWorkday: Number(me.hoursPerWorkday),
      monthlyHoursGoal: me.monthlyHoursGoal ? Number(me.monthlyHoursGoal) : "",
    },
  });

  const now = new Date();
  const [seqYear, setSeqYear] = useState(now.getFullYear());
  const [seqMonth, setSeqMonth] = useState(now.getMonth() + 1);
  const [seqValue, setSeqValue] = useState<number | "">("");
  const [seqConfirmOpened, setSeqConfirmOpened] = useState(false);
  const [seqConfirmText, setSeqConfirmText] = useState("");

  const numberingScopeForm = useForm({
    initialValues: { invoiceNumberingScope: me.invoiceNumberingScope },
  });
  const updateNumberingScope = api.user.updateInvoiceNumberingScope.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Číslování faktur uloženo." });
      await utils.invoice.numberSequence.invalidate();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const numberSequenceQuery = api.invoice.numberSequence.useQuery({
    sourceYear: seqYear,
    sourceMonth: seqMonth,
  });
  // The server-confirmed (saved) value, not the pending selection in the toggle above —
  // until the user saves a new choice, the manual number-sequence override still has to
  // account for what the app will actually use when creating an invoice.
  const activeNumberingScope = numberSequenceQuery.data?.scope ?? me.invoiceNumberingScope;

  const setNumberSequence = api.invoice.setNumberSequence.useMutation({
    onSuccess: async () => {
      notifications.show({
        color: "green",
        message: "Číselná řada faktur byla upravena.",
      });
      setSeqConfirmOpened(false);
      setSeqConfirmText("");
      setSeqValue("");
      await utils.invoice.numberSequence.invalidate();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  // Same logic as numberingPeriodKey in server/invoicing/numbering.ts — duplicated
  // instead of imported, that module pulls in a DB client unsuitable for the client bundle.
  const seqPeriod =
    activeNumberingScope === "year"
      ? String(seqYear)
      : `${seqYear}${String(seqMonth).padStart(2, "0")}`;
  const seqPreviewNumber =
    seqValue === "" ? null : `${seqPeriod}${String(seqValue).padStart(2, "0")}`;

  const passwordForm = useForm({
    initialValues: { newPassword: "", confirm: "" },
    validate: {
      newPassword: (v) =>
        PASSWORD_CHECKS.every((check) => check.test(v))
          ? null
          : "Heslo nesplňuje všechny požadavky níže",
      confirm: (v, values) => (v === values.newPassword ? null : "Hesla se neshodují"),
    },
  });

  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: () => notifications.show({ color: "green", message: "Profil uložen." }),
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const updateDateRules = api.user.updateDateRules.useMutation({
    onSuccess: () => notifications.show({ color: "green", message: "Pravidla dat uložena." }),
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const updateLineItemTemplate = api.user.updateLineItemTemplate.useMutation({
    onSuccess: () =>
      notifications.show({ color: "green", message: "Šablona popisu uložena." }),
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const updateDefaultHourlyRate = api.user.updateDefaultHourlyRate.useMutation({
    onSuccess: () =>
      notifications.show({ color: "green", message: "Základní sazba uložena." }),
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const updateWorkloadSettings = api.user.updateWorkloadSettings.useMutation({
    onSuccess: () =>
      notifications.show({ color: "green", message: "Pracovní nasazení uloženo." }),
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const updatePrimaryColor = api.user.updatePrimaryColor.useMutation({
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const changePassword = api.user.changePassword.useMutation({
    onSuccess: () => {
      notifications.show({ color: "green", message: "Heslo změněno." });
      passwordForm.reset();
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });
  const updateSignature = api.user.updateProfile.useMutation({
    onSuccess: async () => {
      notifications.show({ color: "green", message: "Podpis uložen." });
      await utils.user.me.invalidate();
    },
  });

  return (
    <Stack gap="lg">
      <Card withBorder>
        <Title order={4} mb="md">
          Fakturační profil
        </Title>
        <form
          onSubmit={profileForm.onSubmit((values) =>
            updateProfile.mutate({
              ...values,
              invoiceEmail: values.invoiceEmail || "",
            }),
          )}
        >
          <Grid>
            <Grid.Col span={12}>
              <TextInput label="Jméno / firma" required {...profileForm.getInputProps("name")} />
            </Grid.Col>
            <Grid.Col span={8}>
              <TextInput label="Ulice" {...profileForm.getInputProps("street")} />
            </Grid.Col>
            <Grid.Col span={4}>
              <TextInput label="PSČ" placeholder="123 45" {...profileForm.getInputProps("zip")} />
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInput label="Město" {...profileForm.getInputProps("city")} />
            </Grid.Col>
            <Grid.Col span={6}>
              <TextInput
                label="IČ"
                placeholder="12345678"
                {...profileForm.getInputProps("ico")}
              />
            </Grid.Col>
            <Grid.Col span={6}>
              <TextInput
                label="DIČ"
                placeholder="CZ12345678"
                {...profileForm.getInputProps("dic")}
              />
            </Grid.Col>
            <Grid.Col span={6}>
              <InputBase
                component={IMaskInput}
                mask="+000 000 000 000"
                label="Telefon"
                placeholder="+420 000 000 000"
                value={profileForm.values.phone}
                onAccept={(value: string) => profileForm.setFieldValue("phone", value)}
                error={profileForm.errors.phone}
              />
            </Grid.Col>
            <Grid.Col span={6}>
              <TextInput label="E-mail na fakturu" {...profileForm.getInputProps("invoiceEmail")} />
            </Grid.Col>
            <Grid.Col span={8}>
              <InputBase
                component={IMaskInput}
                mask={/^\d{0,6}-?\d{0,10}$/}
                label="Číslo účtu"
                placeholder="123456-1234567890"
                value={profileForm.values.bankAccount}
                onAccept={(value: string) => profileForm.setFieldValue("bankAccount", value)}
                error={profileForm.errors.bankAccount}
              />
            </Grid.Col>
            <Grid.Col span={4}>
              <InputBase
                component={IMaskInput}
                mask="0000"
                label="Kód banky"
                placeholder="0100"
                value={profileForm.values.bankCode}
                onAccept={(value: string) => profileForm.setFieldValue("bankCode", value)}
                error={profileForm.errors.bankCode}
              />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end" mt="md">
            <Button type="submit" loading={updateProfile.isPending}>
              Uložit profil
            </Button>
          </Group>
        </form>
      </Card>

      <Card withBorder>
        <Title order={4} mb="md">
          Podpis
        </Title>
        <Grid align="center">
          <Grid.Col span={6}>
            <Dropzone
              onDrop={async (files) => {
                const file = files[0];
                if (!file) return;
                const dataUrl = await readFileAsDataUrl(file);
                setSignaturePreview(dataUrl);
                updateSignature.mutate({
                  ...profileForm.values,
                  invoiceEmail: profileForm.values.invoiceEmail || "",
                  signatureImageUrl: dataUrl,
                });
              }}
              onReject={() =>
                notifications.show({
                  color: "red",
                  message: "Nepodporovaný soubor — nahraj PNG nebo JPEG.",
                })
              }
              accept={IMAGE_MIME_TYPE}
              maxFiles={1}
              maxSize={2 * 1024 * 1024}
            >
              <Group justify="center" gap="xs" mih={80} style={{ pointerEvents: "none" }}>
                <Dropzone.Accept>
                  <IconUpload size={28} color="var(--mantine-color-blue-6)" />
                </Dropzone.Accept>
                <Dropzone.Reject>
                  <IconX size={28} color="var(--mantine-color-red-6)" />
                </Dropzone.Reject>
                <Dropzone.Idle>
                  <IconPhoto size={28} color="var(--mantine-color-dimmed)" />
                </Dropzone.Idle>
                <div>
                  <Text size="sm">Přetáhni obrázek podpisu sem</Text>
                  <Text size="xs" c="dimmed">
                    nebo klikni pro výběr — PNG/JPEG, max 2 MB
                  </Text>
                </div>
              </Group>
            </Dropzone>
          </Grid.Col>
          <Grid.Col span={6}>
            <Group justify="center" align="center" mih={80}>
              {signaturePreview ? (
                <Image src={signaturePreview} alt="Podpis" h={100} w="auto" fit="contain" />
              ) : (
                <Text size="sm" c="dimmed">
                  Zatím nenahráno
                </Text>
              )}
            </Group>
          </Grid.Col>
        </Grid>
      </Card>

      <Card withBorder>
        <Title order={4} mb="md">
          Pravidla předvyplnění dat faktury
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Pro každé datum lze zvolit poslední den fakturovaného měsíce, nebo konkrétní
          den v měsíci následujícím (např. splatnost 15. den).
        </Text>
        <form
          onSubmit={dateRulesForm.onSubmit((values) =>
            updateDateRules.mutate({
              issue: formToRule(values.issue.mode, values.issue.day),
              due: formToRule(values.due.mode, values.due.day),
              performance: formToRule(values.performance.mode, values.performance.day),
            }),
          )}
        >
          <Stack gap="sm">
            {(
              [
                ["issue", "Datum vystavení"],
                ["performance", "Datum uskutečnění plnění"],
                ["due", "Datum splatnosti"],
              ] as const
            ).map(([field, label]) => (
              <Group key={field} align="flex-end" wrap="nowrap">
                <Select
                  label={label}
                  data={RULE_MODE_OPTIONS}
                  allowDeselect={false}
                  style={{ flex: 1 }}
                  {...dateRulesForm.getInputProps(`${field}.mode`)}
                />
                {dateRulesForm.values[field].mode === "day" && (
                  <NumberInput
                    label="Den"
                    min={1}
                    max={28}
                    w={100}
                    {...dateRulesForm.getInputProps(`${field}.day`)}
                  />
                )}
              </Group>
            ))}
          </Stack>
          <Group justify="flex-end" mt="md">
            <Button type="submit" loading={updateDateRules.isPending}>
              Uložit
            </Button>
          </Group>
        </form>
      </Card>

      <Card withBorder>
        <Stack gap="lg">
          <div>
            <Title order={5} mb="xs">
              Výchozí popis položky výkazu
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              Použije se jako výchozí text položky faktury při založení nového
              odběratele (alias z výkazu), pokud pole u odběratele necháš prázdné.{" "}
              <code>{"{alias}"}</code> se nahradí konkrétním aliasem — existující
              odběratele je potřeba upravit ručně na stránce Odběratelé.
            </Text>
            <form
              onSubmit={lineItemForm.onSubmit((values) =>
                updateLineItemTemplate.mutate({ template: values.template }),
              )}
            >
              <Group align="flex-end">
                <TextInput
                  placeholder={DEFAULT_LINE_ITEM_TEMPLATE}
                  style={{ flex: 1 }}
                  {...lineItemForm.getInputProps("template")}
                />
                <Button type="submit" loading={updateLineItemTemplate.isPending}>
                  Uložit
                </Button>
              </Group>
            </form>
          </div>

          <Divider />

          <div>
            <Title order={5} mb="xs">
              Základní hodinová sazba
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              Předvyplní se u nově zakládaného odběratele, pokud u něj necháš pole
              &quot;Hodinová sazba&quot; prázdné — existující odběratele je potřeba
              upravit ručně na stránce Odběratelé.
            </Text>
            <form
              onSubmit={hourlyRateForm.onSubmit((values) =>
                updateDefaultHourlyRate.mutate({
                  rate: values.rate === "" ? undefined : Number(values.rate),
                }),
              )}
            >
              <Group align="flex-end">
                <NumberInput
                  label="Sazba (Kč/h)"
                  min={0}
                  style={{ flex: 1 }}
                  {...hourlyRateForm.getInputProps("rate")}
                />
                <Button type="submit" loading={updateDefaultHourlyRate.isPending}>
                  Uložit
                </Button>
              </Group>
            </form>
          </div>

          <Divider />

          <div>
            <Title order={5} mb="xs">
              Minimální pracovní nasazení
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              Cíl pro widget na Přehledu — kolik hodin bys měl/a mít odpracováno k
              dnešnímu dni. Počítá se jen z vybraných pracovních dnů a ořezává se na
              hranice aktuálního týdne/měsíce (např. pondělí z minulého měsíce se do
              tohoto týdne nepočítá).
            </Text>
            <form
              onSubmit={workloadForm.onSubmit((values) =>
                updateWorkloadSettings.mutate({
                  workdays: values.workdays.map(Number),
                  hoursPerWorkday: values.hoursPerWorkday,
                  monthlyHoursGoal:
                    values.monthlyHoursGoal === "" ? null : Number(values.monthlyHoursGoal),
                }),
              )}
            >
              <Stack gap="sm">
                <Chip.Group
                  multiple
                  value={workloadForm.values.workdays}
                  onChange={(v) => workloadForm.setFieldValue("workdays", v)}
                >
                  <Group gap="xs">
                    {WEEKDAY_OPTIONS.map((d) => (
                      <Chip key={d.value} value={d.value} size="sm">
                        {d.label}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
                <Group align="flex-start">
                  <NumberInput
                    label="Hodin za pracovní den"
                    min={0}
                    max={24}
                    w={200}
                    {...workloadForm.getInputProps("hoursPerWorkday")}
                  />
                  <NumberInput
                    label="Vlastní měsíční cíl (h)"
                    description="Prázdné = dosažitelné maximum (prac. dny × hodiny/den)"
                    inputWrapperOrder={["label", "input", "description"]}
                    min={0}
                    max={999}
                    w={260}
                    {...workloadForm.getInputProps("monthlyHoursGoal")}
                  />
                </Group>
              </Stack>
              <Group justify="flex-end" mt="md">
                <Button
                  type="submit"
                  disabled={workloadForm.values.workdays.length === 0}
                  loading={updateWorkloadSettings.isPending}
                >
                  Uložit
                </Button>
              </Group>
            </form>
          </div>
        </Stack>
      </Card>

      <Card withBorder>
        <Title order={4} mb="md">
          Vzhled appky
        </Title>
        <Text size="sm" fw={500} mb="xs">
          Barevný režim
        </Text>
        <SegmentedControl
          value={colorScheme}
          onChange={(v) => {
            if (v === "auto" || v === "light" || v === "dark") setColorScheme(v);
          }}
          data={[
            { value: "auto", label: "Podle systému" },
            { value: "light", label: "Světlý" },
            { value: "dark", label: "Tmavý" },
          ]}
        />

        <Text size="sm" fw={500} mt="md" mb="xs">
          Barva appky
        </Text>
        <Group gap="xs">
          {PRIMARY_COLOR_OPTIONS.map((color) => (
            <ColorSwatch
              key={color}
              component="button"
              color={`var(--mantine-color-${color}-6)`}
              size={30}
              style={{ cursor: "pointer" }}
              onClick={() => setPrimaryColor(color)}
            >
              {color === primaryColor && <IconCheck size={14} color="white" />}
            </ColorSwatch>
          ))}
        </Group>

        <Group justify="flex-end" mt="md">
          <Button
            onClick={async () => {
              try {
                await Promise.all([
                  updateColorScheme.mutateAsync({ colorScheme }),
                  updatePrimaryColor.mutateAsync({ primaryColor }),
                ]);
                notifications.show({ color: "green", message: "Vzhled uložen." });
              } catch {
                // the error is already reported by each mutation's own onError
              }
            }}
            loading={updateColorScheme.isPending || updatePrimaryColor.isPending}
          >
            Uložit vzhled
          </Button>
        </Group>
      </Card>

      <Card withBorder>
        <Title order={4} mb="md">
          Synchronizace výkazů
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Kopie výkazů (název souboru <code>prace{"{YYYYMM}"}.txt</code>) se ukládají
          při každém uložení výkazu v appce — buď do lokální složky, nebo přímo do
          Nextcloudu, nebo obojí zároveň. Obojí je best-effort: neúspěch synchronizace
          neovlivní uložení výkazu samotného.
        </Text>

        <Stack gap="lg">
          <div>
            <Text fw={500} size="sm" mb={4}>
              Lokální složka
            </Text>
            <Text size="sm" c="dimmed" mb="sm">
              Při výběru se do složky nejdřív zkopírují všechny existující výkazy —
              vhodné např. jako sledovaná složka desktopového klienta Nextcloud (appka
              o žádném Nextcloudu neví, jen tam zapisuje soubory jako na disk).
            </Text>
            {!syncSupported ? (
              <Alert color="yellow" variant="light">
                Tvůj prohlížeč tuhle funkci nepodporuje (funguje jen v Chrome/Edge) —
                zkus připojení přes Nextcloud níže.
              </Alert>
            ) : (
              <Stack gap="sm">
                {syncDirName && (
                  <Text size="sm">
                    Aktuální složka: <strong>{syncDirName}</strong>{" "}
                    {syncGranted ? (
                      <Text component="span" c="green" size="sm">
                        (aktivní)
                      </Text>
                    ) : (
                      <Text component="span" c="orange" size="sm">
                        (přístup vypršel)
                      </Text>
                    )}
                  </Text>
                )}
                <Group>
                  <Button
                    variant="light"
                    loading={syncBusy}
                    onClick={() => void handlePickSyncDirectory()}
                  >
                    {syncDirName ? "Změnit složku" : "Vybrat složku"}
                  </Button>
                  {syncDirName && !syncGranted && (
                    <Button
                      variant="light"
                      color="orange"
                      onClick={() => void handleRequestSyncPermission()}
                    >
                      Obnovit přístup
                    </Button>
                  )}
                  {syncDirName && syncGranted && (
                    <Button variant="light" onClick={() => void runFullSync()} loading={syncBusy}>
                      Synchronizovat teď
                    </Button>
                  )}
                  {syncDirName && (
                    <Button variant="subtle" color="red" onClick={() => void handleClearSync()}>
                      Zrušit synchronizaci
                    </Button>
                  )}
                </Group>
              </Stack>
            )}
          </div>

          <Divider />

          <div>
            <Text fw={500} size="sm" mb={4}>
              Nextcloud
            </Text>
            <Text size="sm" c="dimmed" mb="sm">
              Funguje v libovolném prohlížeči — synchronizace běží na serveru appky, ne
              v prohlížeči. Heslo je{" "}
              <Anchor
                href="https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices"
                target="_blank"
                rel="noopener noreferrer"
              >
                aplikační heslo
              </Anchor>{" "}
              z Nextcloud nastavení (Osobní nastavení → Zabezpečení), ne to hlavní.
            </Text>
            {nextcloudStatus.isLoading ? null : nextcloudStatus.data?.configured ? (
              <Stack gap="sm">
                <Text size="sm">
                  Připojeno k <strong>{nextcloudStatus.data.url}</strong> jako{" "}
                  <strong>{nextcloudStatus.data.username}</strong>, složka{" "}
                  <code>{nextcloudStatus.data.remotePath}</code>
                </Text>
                <Group>
                  <Button variant="light" onClick={() => setNextcloudSyncModalOpened(true)}>
                    Synchronizovat teď
                  </Button>
                  <Button
                    variant="subtle"
                    color="red"
                    loading={nextcloudDisconnect.isPending}
                    onClick={() => nextcloudDisconnect.mutate()}
                  >
                    Odpojit
                  </Button>
                </Group>
              </Stack>
            ) : (
              <form
                onSubmit={nextcloudForm.onSubmit((values) =>
                  nextcloudConnect.mutate(values),
                )}
              >
                <Grid>
                  <Grid.Col span={8}>
                    <TextInput
                      label="Adresa serveru"
                      placeholder="https://cloud.example.com"
                      required
                      {...nextcloudForm.getInputProps("url")}
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <TextInput
                      label="Uživatelské jméno"
                      required
                      {...nextcloudForm.getInputProps("username")}
                    />
                  </Grid.Col>
                  <Grid.Col span={8}>
                    <PasswordInput
                      label="Aplikační heslo"
                      required
                      {...nextcloudForm.getInputProps("appPassword")}
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <TextInput
                      label="Složka"
                      placeholder="/Vykazy"
                      {...nextcloudForm.getInputProps("remotePath")}
                    />
                  </Grid.Col>
                </Grid>
                <Group justify="flex-end" mt="md">
                  <Button type="submit" loading={nextcloudConnect.isPending}>
                    Připojit
                  </Button>
                </Group>
              </form>
            )}
          </div>
        </Stack>
      </Card>

      <Card withBorder>
        <Title order={4} mb="md">
          Změna hesla
        </Title>
        <form
          onSubmit={passwordForm.onSubmit((values) =>
            changePassword.mutate({ newPassword: values.newPassword }),
          )}
        >
          <Grid>
            <Grid.Col span={6}>
              <Group align="flex-end" gap="xs" wrap="nowrap">
                <PasswordInput
                  label="Nové heslo"
                  style={{ flex: 1 }}
                  {...passwordForm.getInputProps("newPassword")}
                />
                <Button
                  variant="light"
                  onClick={() => {
                    const generated = generatePassword();
                    passwordForm.setFieldValue("newPassword", generated);
                    passwordForm.setFieldValue("confirm", generated);
                  }}
                >
                  Generovat
                </Button>
              </Group>
              <Stack gap={2} mt={4}>
                {PASSWORD_CHECKS.map((check) => {
                  const ok = check.test(passwordForm.values.newPassword);
                  return (
                    <Group key={check.label} gap={6}>
                      {ok ? (
                        <IconCheck size={14} color="var(--mantine-color-green-6)" />
                      ) : (
                        <IconX size={14} color="var(--mantine-color-gray-5)" />
                      )}
                      <Text size="xs" c={ok ? "green" : "dimmed"}>
                        {check.label}
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            </Grid.Col>
            <Grid.Col span={6}>
              <PasswordInput
                label="Potvrzení hesla"
                {...passwordForm.getInputProps("confirm")}
              />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end" mt="md">
            <Button type="submit" loading={changePassword.isPending}>
              Změnit heslo
            </Button>
          </Group>
        </form>
      </Card>

      <Card withBorder>
        <Title order={4} mb="md">
          Číslování faktur
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Buď zvlášť souvislá řada pro každý měsíc plnění (leden 2026:{" "}
          <code>20260101</code>, <code>20260102</code>…, únor 2026 začíná znovu od
          jedné: <code>20260201</code>…), nebo jedna souvislá řada pro celý rok bez
          ohledu na měsíc (<code>202601</code>, <code>202602</code>… napříč celým
          rokem 2026). Platí jen pro nově založené faktury — starší čísla se
          nepřepočítávají, takže to jde kdykoliv přepnout tam a zpátky (např. na
          přelomu roku).
        </Text>
        <form
          onSubmit={numberingScopeForm.onSubmit((values) =>
            updateNumberingScope.mutate(values),
          )}
        >
          <SegmentedControl
            data={[
              { value: "month", label: "V rámci měsíce" },
              { value: "year", label: "V rámci roku" },
            ]}
            {...numberingScopeForm.getInputProps("invoiceNumberingScope")}
          />
          <Group justify="flex-end" mt="md">
            <Button type="submit" loading={updateNumberingScope.isPending}>
              Uložit
            </Button>
          </Group>
        </form>
      </Card>

      <Card withBorder style={{ borderColor: "var(--mantine-color-red-6)" }}>
        <Group gap="xs" mb="md">
          <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />
          <Title order={4} c="red">
            Číselná řada faktur
          </Title>
        </Group>
        <Alert
          color="red"
          variant="light"
          mb="md"
          icon={<IconAlertTriangle size={16} />}
          title="Citlivý údaj — zasahuj jen pokud opravdu víš, co děláš"
        >
          <List size="sm" spacing={2}>
            <List.Item>
              Číslo faktury musí ze zákona tvořit souvislou řadu bez mezer a duplicit.
            </List.Item>
            <List.Item>
              Ruční změna může vytvořit duplicitní nebo chybějící číslo — problém při
              daňové kontrole.
            </List.Item>
            <List.Item>
              Použij jen při zavádění systému (přechod v průběhu roku) nebo opravě
              prokazatelné chyby, ne běžně.
            </List.Item>
          </List>
        </Alert>
        <Text size="sm" c="dimmed" mb="sm">
          {activeNumberingScope === "year"
            ? "Číslování běží jako jedna souvislá řada pro celý rok (měsíc pořadí neovlivňuje). "
            : "Číslování běží samostatně pro každý měsíc plnění. "}
          Zadej <strong>poslední reálně použité číslo</strong> pro{" "}
          {activeNumberingScope === "year" ? "vybraný rok" : "vybrané období"} — příští
          faktura založená v appce {activeNumberingScope === "year" ? "v tomto roce" : "pro toto období"} dostane
          číslo o jednu vyšší.
        </Text>
        <Grid align="flex-end" mb="md">
          <Grid.Col span={activeNumberingScope === "year" ? 4 : 3}>
            <NumberInput
              label="Rok"
              min={2000}
              max={2100}
              hideControls
              value={seqYear}
              onChange={(v) => setSeqYear(v === "" ? now.getFullYear() : Number(v))}
            />
          </Grid.Col>
          {activeNumberingScope === "month" && (
            <Grid.Col span={4}>
              <Select
                label="Měsíc plnění"
                data={MONTH_OPTIONS}
                allowDeselect={false}
                value={String(seqMonth)}
                onChange={(v) => v && setSeqMonth(Number(v))}
              />
            </Grid.Col>
          )}
          <Grid.Col span={activeNumberingScope === "year" ? 8 : 5}>
            <Text size="sm" c="dimmed" mb={2}>
              Aktuálně poslední použité číslo v appce
            </Text>
            <Text fw={600} ff="monospace">
              {numberSequenceQuery.isLoading
                ? "…"
                : !numberSequenceQuery.data?.lastSequence
                  ? "zatím žádné"
                  : String(numberSequenceQuery.data.lastSequence).padStart(2, "0")}
            </Text>
          </Grid.Col>
        </Grid>
        <Group align="flex-start">
          <NumberInput
            label="Nové poslední použité číslo"
            description={
              activeNumberingScope === "year"
                ? "Dvoumístné pořadové číslo v rámci roku (0–99) — příští faktura z appky dostane toto číslo + 1"
                : "Dvoumístné pořadové číslo v rámci měsíce (0–99) — příští faktura z appky dostane toto číslo + 1"
            }
            inputWrapperOrder={["label", "input", "description"]}
            min={0}
            max={99}
            hideControls
            style={{ flex: 1 }}
            value={seqValue}
            onChange={(v) => setSeqValue(v === "" ? "" : Number(v))}
          />
          {/* Invisible "label" above the button — aligns it with the input on the left
              (flex-start), even though that one also has a description the button doesn't. */}
          <Stack gap={4}>
            <Text size="sm" fw={500} style={{ opacity: 0 }} aria-hidden>
              &nbsp;
            </Text>
            <Button
              color="red"
              variant="outline"
              disabled={seqValue === ""}
              onClick={() => {
                setSeqConfirmText("");
                setSeqConfirmOpened(true);
              }}
            >
              Upravit číselnou řadu
            </Button>
          </Stack>
        </Group>
      </Card>

      <Modal
        opened={seqConfirmOpened}
        onClose={() => setSeqConfirmOpened(false)}
        centered
        title={
          <Group gap="xs">
            <IconAlertTriangle size={18} color="var(--mantine-color-red-6)" />
            <Text fw={700} c="red">
              Opravdu zasáhnout do číselné řady faktur?
            </Text>
          </Group>
        }
      >
        <Alert color="red" variant="filled" mb="md">
          Tohle je citlivá operace s dopadem na zákonné číslování faktur. Ruční zásah
          může vytvořit duplicitu nebo mezeru v číselné řadě. Pokračuj jen pokud přesně
          víš, co děláš.
        </Alert>
        <Text size="sm" mb="xs">
          {activeNumberingScope === "year" ? (
            <>
              Rok: <strong>{seqYear}</strong>
            </>
          ) : (
            <>
              Období: <strong>{MONTH_OPTIONS[seqMonth - 1]?.label} {seqYear}</strong>
            </>
          )}
          <br />
          Příští faktura založená v appce {activeNumberingScope === "year" ? "v tomto roce" : "pro toto období"} dostane
          číslo:
        </Text>
        <Group gap={4} mb="sm" justify="center">
          <Stack gap={0} align="center">
            <Text ff="monospace" fw={700} size="xl" c="dimmed">
              {seqYear}
            </Text>
            <Text size="xs" c="dimmed">
              rok
            </Text>
          </Stack>
          {activeNumberingScope === "month" && (
            <Stack gap={0} align="center">
              <Text ff="monospace" fw={700} size="xl" c="dimmed">
                {String(seqMonth).padStart(2, "0")}
              </Text>
              <Text size="xs" c="dimmed">
                měsíc
              </Text>
            </Stack>
          )}
          <Stack gap={0} align="center">
            <Text ff="monospace" fw={700} size="xl" c="red">
              {seqValue === "" ? "??" : String(seqValue).padStart(2, "0")}
            </Text>
            <Text size="xs" c="red">
              pořadí + 1
            </Text>
          </Stack>
        </Group>
        <Text size="sm" mb={4}>
          Pro potvrzení opiš přesně toto číslo (
          {activeNumberingScope === "year" ? "rok, pořadové číslo" : "rok, měsíc, pořadové číslo"}):
        </Text>
        <Text fw={700} ff="monospace" mb="sm" ta="center">
          {seqPreviewNumber}
        </Text>
        <InputBase
          component={IMaskInput}
          mask={activeNumberingScope === "year" ? "0000 00" : "0000 00 00"}
          unmask
          placeholder={activeNumberingScope === "year" ? "RRRR PP" : "RRRR MM PP"}
          value={seqConfirmText}
          onAccept={(value: string) => setSeqConfirmText(value)}
          label="Potvrzovací číslo"
          description={
            activeNumberingScope === "year"
              ? "Formát: RRRR PP — rok, pořadové číslo"
              : "Formát: RRRR MM PP — rok, měsíc, pořadové číslo"
          }
          inputWrapperOrder={["label", "input", "description"]}
          error={
            seqConfirmText.length > 0 && seqConfirmText !== seqPreviewNumber
              ? "Neshoduje se se zobrazeným číslem"
              : undefined
          }
          rightSection={
            seqConfirmText.length > 0 && seqConfirmText === seqPreviewNumber ? (
              <IconCheck size={16} color="var(--mantine-color-green-6)" />
            ) : undefined
          }
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => setSeqConfirmOpened(false)}>
            Zrušit
          </Button>
          <Button
            color="red"
            disabled={seqValue === "" || seqConfirmText !== seqPreviewNumber}
            loading={setNumberSequence.isPending}
            onClick={() => {
              if (seqValue === "") return;
              setNumberSequence.mutate({
                sourceYear: seqYear,
                sourceMonth: seqMonth,
                lastSequence: seqValue,
              });
            }}
          >
            Ano, změnit číselnou řadu
          </Button>
        </Group>
      </Modal>

      <NextcloudSyncModal
        opened={nextcloudSyncModalOpened}
        onClose={() => setNextcloudSyncModalOpened(false)}
      />

      <Divider />
    </Stack>
  );
}
