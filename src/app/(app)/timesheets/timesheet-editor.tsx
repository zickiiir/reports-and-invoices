"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
// `dayjs/locale/cs` is only imported into the server bundle in the root layout — this
// client component needs its own import, otherwise `.locale("cs")` silently falls back to "en".
import "dayjs/locale/cs";
import {
  EditorSelection,
  Prec,
  Transaction,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { emacs } from "@replit/codemirror-emacs";
import { vim } from "@replit/codemirror-vim";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Grid,
  Group,
  Loader,
  NavLink,
  Popover,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconDeviceFloppy,
  IconDownload,
  IconFileInvoice,
  IconFileTypeHtml,
  IconFileTypePdf,
  IconListDetails,
  IconSettings,
  IconUpload,
} from "@tabler/icons-react";
import { basicSetup } from "codemirror";
import { useQueryStates, parseAsString } from "nuqs";

import { writeFileToSyncDirectory } from "~/components/local-sync";
import { ReportPreviewModal } from "~/components/report-preview-modal";
import {
  type CursorStyle,
  type EditorKeybinding,
  type UserRole,
} from "~/server/db/schema";
import { suggestedFilename } from "~/server/timesheet/filename";
import {
  formatHoursColon,
  parseTimesheet,
  type ParseTimesheetResult,
} from "~/server/timesheet/parse";
import { computeWorkloadStats } from "~/server/timesheet/workload";
import { api } from "~/trpc/react";

import { WorkloadCard } from "../dashboard-cards";
import { TaskSummaryModal } from "./task-summary-modal";
import { TimesheetImportModal } from "./timesheet-import-modal";

const MONTH_NAMES = [
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
];

// CodeMirror draws the cursor as a thin vertical line by default — for the "block"
// style we just recolor/widen it via the theme, there's no dedicated cursor-shape extension.
const blockCursor = EditorView.theme({
  ".cm-cursor, .cm-dropCursor": {
    borderLeftWidth: "0",
    backgroundColor: "currentColor",
    width: "0.6em",
    opacity: "0.5",
  },
});

// `basicSetup` always includes line numbers — the only way to turn them off is to hide the gutter.
const hideLineNumbers = EditorView.theme({
  ".cm-gutters": { display: "none" },
});

// Without this CodeMirror grows in height with its content and the whole page scrolls
// — this way it fills its container (see `height`/`minHeight` on editorRef below) and
// only the editor itself scrolls, so the rest of the UI stays visible even on a small
// (phone) screen.
const fillHeight = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": { overflow: "auto" },
});

const round2 = (n: number) => Math.round(n * 100) / 100;

function groupByYear(periods: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of periods) {
    const year = p.slice(0, 4);
    (out[year] ??= []).push(p);
  }
  return out;
}

export function TimesheetEditor({
  me,
  visibleUsers,
  defaultPeriod,
}: {
  me: {
    id: string;
    role: UserRole;
    editorKeybinding: EditorKeybinding;
    cursorStyle: CursorStyle;
    showLineNumbers: boolean;
    workdays: number[];
    hoursPerWorkday: number;
    monthlyHoursGoal: number | null;
  };
  visibleUsers: { id: string; name: string; role: UserRole }[];
  defaultPeriod: string;
}) {
  const [{ userId, period }, setQuery] = useQueryStates({
    userId: parseAsString.withDefault(me.id),
    period: parseAsString.withDefault(defaultPeriod),
  });
  const [newPeriodInput, setNewPeriodInput] = useState("");
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(
    new Set(),
  );
  const [importOpened, setImportOpened] = useState(false);
  const [tasksOpened, setTasksOpened] = useState(false);
  const [selectedAliases, setSelectedAliases] = useState<Set<string>>(
    new Set(),
  );
  // The customer selection for bulk PDF should reset when the user/period changes —
  // "adjusting state when a prop changes" (React docs), not an effect (that would be an
  // unnecessary extra render).
  const [selectedAliasesKey, setSelectedAliasesKey] = useState(
    `${userId}:${period}`,
  );
  if (selectedAliasesKey !== `${userId}:${period}`) {
    setSelectedAliasesKey(`${userId}:${period}`);
    setSelectedAliases(new Set());
  }
  const [preview, setPreview] = useState<{
    kind: "pdf" | "html";
    title: string;
    url: string;
    filename: string;
  } | null>(null);

  // The currently APPLIED editor settings — separate local state (not `me.x` directly),
  // so they can be applied immediately after clicking "Save" in the popover below,
  // without needing a reload/navigation (which isn't reliable to depend on, see the router cache).
  const [editorPrefs, setEditorPrefs] = useState({
    editorKeybinding: me.editorKeybinding,
    cursorStyle: me.cursorStyle,
    showLineNumbers: me.showLineNumbers,
  });
  const [prefsOpened, setPrefsOpened] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState(editorPrefs);
  const updateEditorPreferences = api.user.updateEditorPreferences.useMutation({
    onSuccess: () => {
      notifications.show({
        color: "green",
        message: "Nastavení editoru uloženo.",
      });
      setEditorPrefs(prefsDraft);
      setPrefsOpened(false);
    },
    onError: (e) => notifications.show({ color: "red", message: e.message }),
  });

  const isOwner = userId === me.id;
  const canEdit = isOwner || me.role === "super_user";

  const utils = api.useUtils();
  const periodsQuery = api.timesheet.listPeriods.useQuery({ userId });
  const readQuery = api.timesheet.read.useQuery({ userId, period });
  const customersQuery = api.customer.list.useQuery({ userId });
  const rateByAlias = new Map(
    (customersQuery.data ?? []).map((c) => [
      c.alias,
      c.defaultHourlyRate ? Number(c.defaultHourlyRate) : 0,
    ]),
  );
  const saveMutation = api.timesheet.save.useMutation({
    onSuccess: async (result, variables) => {
      notifications.show({ color: "green", message: "Výkaz uložen." });
      setDirty(false);
      await Promise.all([
        utils.timesheet.listPeriods.invalidate({ userId }),
        utils.timesheet.read.invalidate({ userId, period }),
      ]);
      const synced = await writeFileToSyncDirectory(
        suggestedFilename(variables.period),
        variables.content,
      );
      if (synced) {
        notifications.show({
          color: "blue",
          message: "Zkopírováno i do synchronizované složky.",
        });
      }
      if (result.nextcloudSync === "synced") {
        notifications.show({
          color: "blue",
          message: "Zesynchronizováno i s Nextcloudem.",
        });
      } else if (result.nextcloudSync === "conflict") {
        notifications.show({
          color: "orange",
          message:
            "Na Nextcloudu už existuje soubor se stejným názvem — nepřepsáno. Vyřeš to v Nastavení (Synchronizovat teď).",
        });
      } else if (result.nextcloudSync === "failed") {
        notifications.show({
          color: "red",
          message: "Synchronizace s Nextcloudem selhala.",
        });
      }
    },
    onError: (err) => {
      notifications.show({
        color: "red",
        message: `Uložení selhalo: ${err.message}`,
      });
    },
  });

  const [dirty, setDirty] = useState(false);
  const [liveResult, setLiveResult] = useState<ParseTimesheetResult | null>(
    null,
  );
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const savingRef = useRef(saveMutation);
  const periodRef = useRef(period);
  const readDataRef = useRef(readQuery.data);
  const dirtyRef = useRef(dirty);
  // Which timesheet (`userId/period`) is currently loaded in the editor — lets the
  // load effect below tell switching to another timesheet apart from a mere refetch
  // of the same one (after save, on window focus).
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    savingRef.current = saveMutation;
    periodRef.current = period;
    readDataRef.current = readQuery.data;
    dirtyRef.current = dirty;
  });

  // The editor gets recreated when switching users ("on whose behalf") or keybindings —
  // editability changes at that point too (only the owner/super_user may write). If we
  // already have data loaded (keybinding switch, not user switch), the content is
  // filled in right away — otherwise it's filled in separately in the effect below,
  // once data arrives from `timesheet.read`.
  useEffect(() => {
    if (!editorRef.current) return;
    const extensions: Extension[] = [
      basicSetup,
      fillHeight,
      editorPrefs.editorKeybinding === "vim" ? vim() : emacs(),
      ...(editorPrefs.cursorStyle === "block" ? [blockCursor] : []),
      ...(editorPrefs.showLineNumbers ? [] : [hideLineNumbers]),
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: (view) => {
              savingRef.current.mutate({
                userId,
                period: periodRef.current,
                content: view.state.doc.toString(),
              });
              return true;
            },
          },
        ]),
      ),
      EditorView.editable.of(canEdit),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const text = update.state.doc.toString();
        setDirty(true);
        setLiveResult(parseTimesheet(text, periodRef.current));
      }),
    ];
    const view = new EditorView({
      doc: "",
      extensions,
      parent: editorRef.current,
    });
    viewRef.current = view;
    loadedKeyRef.current = null;
    if (readDataRef.current) {
      loadedKeyRef.current = `${userId}/${periodRef.current}`;
      const content = readDataRef.current.content;
      view.dispatch({
        changes: { from: 0, to: 0, insert: content },
        // A new day is always appended at the end, not the beginning — so you don't
        // have to manually scroll down every time after opening the timesheet.
        selection: EditorSelection.cursor(content.length),
        scrollIntoView: true,
        // Without this, the first Ctrl+Z (or "u" in vim) would delete the whole loaded
        // content back to the empty state the editor was created with — programmatically
        // inserting the timesheet must not count toward the user's Undo history.
        annotations: Transaction.addToHistory.of(false),
      });
      setLiveResult(readDataRef.current.parsed);
      // Inserting content into the newly created instance goes through the
      // `updateListener` below (it has docChanged: true), which would otherwise
      // mistakenly mark the timesheet as unsaved — recreating the editor by itself
      // doesn't mean any user change happened.
      setDirty(false);
    }
    return () => view.destroy();
  }, [
    userId,
    canEdit,
    editorPrefs.editorKeybinding,
    editorPrefs.cursorStyle,
    editorPrefs.showLineNumbers,
  ]);

  // Load content from the API into the editor when the period/user changes.
  useEffect(() => {
    if (!readQuery.data || !viewRef.current) return;
    const view = viewRef.current;
    const content = readQuery.data.content;
    const key = `${userId}/${period}`;
    // A refetch of the already loaded timesheet (typically right after saving) must
    // not move the cursor to the end or overwrite what the user has typed since —
    // only an unedited editor gets updated, keeping the cursor where it was.
    if (loadedKeyRef.current === key) {
      if (dirtyRef.current || view.state.doc.toString() === content) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        selection: EditorSelection.cursor(
          Math.min(view.state.selection.main.head, content.length),
        ),
        annotations: Transaction.addToHistory.of(false),
      });
      setDirty(false);
      setLiveResult(readQuery.data.parsed);
      return;
    }
    loadedKeyRef.current = key;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      selection: EditorSelection.cursor(content.length),
      scrollIntoView: true,
      // See the comment on the same annotation above — otherwise switching
      // period/user could be undone with Ctrl+Z/"u" back to the previously shown content.
      annotations: Transaction.addToHistory.of(false),
    });
    setDirty(false);
    setLiveResult(readQuery.data.parsed);
  }, [readQuery.data, userId, period]);

  const periodsByYear = groupByYear(periodsQuery.data ?? []);
  const years = Object.keys(periodsByYear).sort(
    (a, b) => Number(b) - Number(a),
  );

  // The widget only makes sense for your own timesheet (someone else's would compare
  // my goals against someone else's timesheet). For the current month, "goal to date"
  // is computed against today; for an older month it's already fully "elapsed"
  // (reference day = the last day of that month, so it shows complete fulfillment for
  // the whole month); for a future month nothing has elapsed yet (reference day = the
  // first day of that month). Using `liveResult` (not `readQuery.data`) so the widget
  // updates immediately while typing, not only after saving.
  const viewedMonth = dayjs(period, "YYYYMM");
  const today = dayjs();
  const workloadReferenceDate =
    period === today.format("YYYYMM")
      ? today
      : viewedMonth.isBefore(today, "month")
        ? viewedMonth.endOf("month")
        : viewedMonth.startOf("month");
  const workloadStats =
    isOwner && liveResult
      ? computeWorkloadStats(
          workloadReferenceDate,
          {
            workdays: me.workdays,
            hoursPerWorkday: me.hoursPerWorkday,
            monthlyHoursGoal: me.monthlyHoursGoal,
          },
          liveResult.perPerson,
        )
      : null;

  const handleSave = () => {
    if (!viewRef.current) return;
    saveMutation.mutate({
      userId,
      period,
      content: viewRef.current.state.doc.toString(),
    });
  };

  const toggleSelected = (p: string) => {
    setSelectedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const toggleYearSelected = (year: string) => {
    const yearPeriods = periodsByYear[year] ?? [];
    setSelectedPeriods((prev) => {
      const next = new Set(prev);
      const allSelected = yearPeriods.every((p) => next.has(p));
      for (const p of yearPeriods) {
        if (allSelected) next.delete(p);
        else next.add(p);
      }
      return next;
    });
  };

  const handleBulkDownload = () => {
    const params = new URLSearchParams({
      userId,
      periods: [...selectedPeriods].sort().join(","),
    });
    window.open(`/api/timesheets/download?${params.toString()}`, "_blank");
  };

  const toggleAliasSelected = (alias: string) => {
    setSelectedAliases((prev) => {
      const next = new Set(prev);
      if (next.has(alias)) next.delete(alias);
      else next.add(alias);
      return next;
    });
  };

  const openPreview = (aliases: string[], kind: "pdf" | "html") => {
    if (aliases.length === 0) return;
    const filenameBase =
      aliases.length === 1
        ? `Vykaz_${aliases[0]}_${period}`
        : `Vykazy_${period}`;
    setPreview({
      kind,
      title:
        aliases.length === 1
          ? `Výkaz ${aliases[0]} ${period}`
          : `Výkazy ${period} (${aliases.join(", ")})`,
      url: `/api/timesheets/report?userId=${userId}&period=${period}&alias=${aliases.join(",")}&format=${kind}`,
      filename: `${filenameBase}.${kind === "pdf" ? "pdf" : "htm"}`,
    });
  };

  return (
    <Grid gap="md" style={{ minHeight: "calc(100vh - 120px)" }}>
      <Grid.Col span={{ base: 12, md: 3 }}>
        <Card withBorder padding="sm" h="100%">
          {visibleUsers.length > 1 && (
            <Select
              label="Za koho"
              mb="sm"
              data={visibleUsers.map((u) => ({ value: u.id, label: u.name }))}
              value={userId}
              onChange={(v) => v && setQuery({ userId: v })}
            />
          )}
          <Group gap="xs" mb="xs">
            <TextInput
              placeholder="YYYYMM"
              size="xs"
              value={newPeriodInput}
              onChange={(e) => setNewPeriodInput(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              size="xs"
              disabled={!/^\d{6}$/.test(newPeriodInput)}
              onClick={() => {
                void setQuery({ period: newPeriodInput });
                setNewPeriodInput("");
              }}
            >
              Otevřít
            </Button>
          </Group>
          <Group justify="space-between" mb="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconUpload size={14} />}
              onClick={() => setImportOpened(true)}
            >
              Import
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDownload size={14} />}
              disabled={selectedPeriods.size === 0}
              onClick={handleBulkDownload}
            >
              Stáhnout
              {selectedPeriods.size > 0 ? ` (${selectedPeriods.size})` : ""}
            </Button>
          </Group>
          <Divider mb="xs" label="Historie" />
          <ScrollArea h="calc(100vh - 360px)">
            {periodsQuery.isLoading && <Loader size="sm" />}
            {years.map((year) => {
              const yearPeriods = periodsByYear[year]!;
              const allYearSelected = yearPeriods.every((p) =>
                selectedPeriods.has(p),
              );
              const someYearSelected = yearPeriods.some((p) =>
                selectedPeriods.has(p),
              );
              return (
                <NavLink
                  key={year}
                  label={
                    <Group gap="xs" wrap="nowrap">
                      <Checkbox
                        size="xs"
                        checked={allYearSelected}
                        indeterminate={!allYearSelected && someYearSelected}
                        onChange={() => toggleYearSelected(year)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>{year}</span>
                    </Group>
                  }
                  defaultOpened={Number(year) === dayjs().year()}
                  mb={4}
                  style={{ borderRadius: "var(--mantine-radius-md)" }}
                >
                  {periodsByYear[year]!.sort((a, b) => b.localeCompare(a)).map(
                    (p) => (
                      <NavLink
                        key={p}
                        label={
                          <Group gap="xs" wrap="nowrap">
                            <Checkbox
                              size="xs"
                              checked={selectedPeriods.has(p)}
                              onChange={() => toggleSelected(p)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span>
                              {MONTH_NAMES[Number(p.slice(4, 6)) - 1]}
                            </span>
                          </Group>
                        }
                        active={p === period}
                        onClick={() => setQuery({ period: p })}
                        mb={4}
                        style={{ borderRadius: "var(--mantine-radius-md)" }}
                      />
                    ),
                  )}
                </NavLink>
              );
            })}
          </ScrollArea>
        </Card>
      </Grid.Col>

      <TimesheetImportModal
        opened={importOpened}
        onClose={() => setImportOpened(false)}
        userId={userId}
        existingPeriods={periodsQuery.data ?? []}
        onImported={async (importedPeriods) => {
          await utils.timesheet.listPeriods.invalidate({ userId });
          if (importedPeriods.includes(period)) {
            await utils.timesheet.read.invalidate({ userId, period });
          }
        }}
      />

      <ReportPreviewModal
        opened={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.title ?? ""}
        url={preview?.url ?? null}
        filename={preview?.filename ?? ""}
      />

      <TaskSummaryModal
        opened={tasksOpened}
        onClose={() => setTasksOpened(false)}
        title={`Hodiny podle úkolů — ${MONTH_NAMES[Number(period.slice(4, 6)) - 1]} ${period.slice(0, 4)}`}
        perPerson={liveResult?.perPerson ?? []}
        onJumpToLine={(lineNumber) => {
          const view = viewRef.current;
          if (!view || lineNumber > view.state.doc.lines) return;
          setTasksOpened(false);
          const line = view.state.doc.line(lineNumber);
          view.dispatch({
            selection: EditorSelection.cursor(line.from),
            effects: EditorView.scrollIntoView(line.from, { y: "center" }),
          });
          view.focus();
        }}
      />

      <Grid.Col span={{ base: 12, md: 6 }}>
        <Card withBorder padding="sm" h="100%">
          <Group justify="space-between" mb="sm">
            <Title order={4}>
              Výkaz {MONTH_NAMES[Number(period.slice(4, 6)) - 1]}{" "}
              {period.slice(0, 4)}
            </Title>
            <Group gap="xs">
              {dirty && (
                <Badge color="yellow" variant="light">
                  Neuloženo
                </Badge>
              )}
              {!canEdit && (
                <Badge color="gray" variant="light">
                  Jen ke čtení
                </Badge>
              )}
              <Popover
                opened={prefsOpened}
                onChange={setPrefsOpened}
                position="bottom-end"
                withArrow
                shadow="md"
              >
                <Popover.Target>
                  <Tooltip label="Nastavení editoru">
                    <ActionIcon
                      variant="light"
                      onClick={() => {
                        setPrefsDraft(editorPrefs);
                        setPrefsOpened((o) => !o);
                      }}
                    >
                      <IconSettings size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Popover.Target>
                <Popover.Dropdown>
                  <Stack gap="sm" w={220}>
                    <Select
                      label="Zkratky"
                      data={[
                        { value: "emacs", label: "Emacs" },
                        { value: "vim", label: "Vim" },
                      ]}
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: false }}
                      value={prefsDraft.editorKeybinding}
                      onChange={(v) => {
                        if (v === "emacs" || v === "vim") {
                          setPrefsDraft((d) => ({ ...d, editorKeybinding: v }));
                        }
                      }}
                    />
                    <Select
                      label="Kurzor"
                      data={[
                        { value: "line", label: "Čára" },
                        { value: "block", label: "Blok" },
                      ]}
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: false }}
                      value={prefsDraft.cursorStyle}
                      onChange={(v) => {
                        if (v === "line" || v === "block") {
                          setPrefsDraft((d) => ({ ...d, cursorStyle: v }));
                        }
                      }}
                    />
                    <Checkbox
                      label="Zobrazovat čísla řádků"
                      checked={prefsDraft.showLineNumbers}
                      onChange={(e) => {
                        // Don't read e.currentTarget inside the setState updater function
                        // — in StrictMode React calls it a second time too, outside the event's lifetime.
                        const checked = e.currentTarget.checked;
                        setPrefsDraft((d) => ({
                          ...d,
                          showLineNumbers: checked,
                        }));
                      }}
                    />
                    <Button
                      size="xs"
                      fullWidth
                      onClick={() => updateEditorPreferences.mutate(prefsDraft)}
                      loading={updateEditorPreferences.isPending}
                    >
                      Uložit
                    </Button>
                  </Stack>
                </Popover.Dropdown>
              </Popover>
              {canEdit && (
                <Button
                  size="xs"
                  leftSection={<IconDeviceFloppy size={14} />}
                  onClick={handleSave}
                  loading={saveMutation.isPending}
                >
                  Uložit (Ctrl/Cmd+S)
                </Button>
              )}
            </Group>
          </Group>
          {/*
            The container must always be in the DOM (even while loading) — CodeMirror
            mounts into it in an effect only once, when the component is created/the
            user is switched; if the div were conditionally hidden behind a Loader,
            `editorRef.current` would be null on the effect's first run and the editor
            would never get created.
          */}
          <div style={{ position: "relative" }}>
            {readQuery.isLoading && (
              <Loader
                size="sm"
                style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}
              />
            )}
            <div
              ref={editorRef}
              style={{
                border: "1px solid var(--mantine-color-gray-3)",
                borderRadius: 6,
                height: "calc(100vh - 260px)",
                minHeight: 320,
                fontSize: 14,
              }}
            />
          </div>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 3 }}>
        <Stack gap="md">
          <Card withBorder padding="sm">
            <Title order={5} mb="sm">
              Přehled
            </Title>
            {liveResult ? (
              <Stack gap="sm">
                <Group justify="flex-end">
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconListDetails size={14} />}
                    disabled={liveResult.timesheets.length === 0}
                    onClick={() => setTasksOpened(true)}
                  >
                    Úkoly
                  </Button>
                  {isOwner && (
                    <Button
                      component={Link}
                      href={`/invoices/new?year=${period.slice(0, 4)}&month=${Number(period.slice(4, 6))}${
                        selectedAliases.size > 0
                          ? `&alias=${[...selectedAliases][0]}`
                          : ""
                      }`}
                      size="xs"
                      variant="light"
                      leftSection={<IconFileInvoice size={14} />}
                    >
                      Fakturovat{" "}
                      {selectedAliases.size > 0
                        ? `(${selectedAliases.size})`
                        : "všem"}
                    </Button>
                  )}
                  <Tooltip
                    label="Ulož výkaz, ať je náhled aktuální"
                    disabled={!dirty}
                  >
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconFileTypePdf size={14} />}
                      disabled={dirty || liveResult.timesheets.length === 0}
                      onClick={() =>
                        openPreview(
                          selectedAliases.size > 0
                            ? [...selectedAliases]
                            : liveResult.timesheets.map((t) => t.name),
                          "pdf",
                        )
                      }
                    >
                      PDF{" "}
                      {selectedAliases.size > 0
                        ? `(${selectedAliases.size})`
                        : "(všech)"}
                    </Button>
                  </Tooltip>
                </Group>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>
                        <Checkbox
                          size="xs"
                          checked={
                            liveResult.timesheets.length > 0 &&
                            liveResult.timesheets.every((t) =>
                              selectedAliases.has(t.name),
                            )
                          }
                          indeterminate={
                            liveResult.timesheets.some((t) =>
                              selectedAliases.has(t.name),
                            ) &&
                            !liveResult.timesheets.every((t) =>
                              selectedAliases.has(t.name),
                            )
                          }
                          onChange={() =>
                            setSelectedAliases((prev) => {
                              const allSelected = liveResult.timesheets.every(
                                (t) => prev.has(t.name),
                              );
                              return allSelected
                                ? new Set()
                                : new Set(
                                    liveResult.timesheets.map((t) => t.name),
                                  );
                            })
                          }
                        />
                      </Table.Th>
                      <Table.Th>Odběratel</Table.Th>
                      <Table.Th>Hodiny</Table.Th>
                      <Table.Th>Sazba</Table.Th>
                      <Table.Th>Celkem</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {liveResult.timesheets.map((t) => {
                      const rate = rateByAlias.get(t.name) ?? 0;
                      const total = round2(t.hours * rate);
                      const previewTitle = dirty
                        ? "Ulož výkaz, ať je náhled aktuální"
                        : undefined;
                      return (
                        <Table.Tr key={t.name}>
                          <Table.Td>
                            <Checkbox
                              size="xs"
                              checked={selectedAliases.has(t.name)}
                              onChange={() => toggleAliasSelected(t.name)}
                            />
                          </Table.Td>
                          <Table.Td>{t.name}</Table.Td>
                          <Table.Td>{t.hours.toFixed(2)}</Table.Td>
                          <Table.Td>
                            {rate ? `${rate.toLocaleString("cs-CZ")} Kč` : "—"}
                          </Table.Td>
                          <Table.Td>
                            {total.toLocaleString("cs-CZ")} Kč
                          </Table.Td>
                          <Table.Td>
                            <Group gap={4} wrap="nowrap">
                              <Tooltip label={previewTitle ?? `HTML — ${t.name}`}>
                                <ActionIcon
                                  disabled={dirty}
                                  onClick={() => openPreview([t.name], "html")}
                                >
                                  <IconFileTypeHtml size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label={previewTitle ?? `PDF — ${t.name}`}>
                                <ActionIcon
                                  disabled={dirty}
                                  onClick={() => openPreview([t.name], "pdf")}
                                >
                                  <IconFileTypePdf size={16} />
                                </ActionIcon>
                              </Tooltip>
                              {isOwner && (
                                <Tooltip label={`Fakturovat — ${t.name}`}>
                                  <ActionIcon
                                    component={Link}
                                    href={`/invoices/new?year=${period.slice(0, 4)}&month=${Number(period.slice(4, 6))}&alias=${t.name}`}
                                  >
                                    <IconFileInvoice size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                  <Table.Tfoot>
                    <Table.Tr
                      style={{
                        borderTop:
                          "2px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Table.Th colSpan={4}>Celkem</Table.Th>
                      <Table.Th colSpan={2}>
                        {round2(
                          liveResult.timesheets.reduce(
                            (sum, t) =>
                              sum + t.hours * (rateByAlias.get(t.name) ?? 0),
                            0,
                          ),
                        ).toLocaleString("cs-CZ")}{" "}
                        Kč
                      </Table.Th>
                    </Table.Tr>
                  </Table.Tfoot>
                </Table>
                {liveResult.timesheets.some((t) => t.overtime.length > 0) && (
                  <div>
                    <Text size="sm" fw={500} mb={4}>
                      Přesčasy (&gt;8h/den)
                    </Text>
                    <Stack gap={2}>
                      {liveResult.timesheets
                        .filter((t) => t.overtime.length > 0)
                        .flatMap((t) =>
                          t.overtime.map((o) => (
                            <Text
                              size="xs"
                              key={`${t.name}-${o.date}`}
                              c="orange"
                            >
                              {t.name}:{" "}
                              {dayjs(o.date)
                                .locale("cs")
                                .format("ddd D. M. YYYY")}{" "}
                              ({formatHoursColon(Math.round(o.hours * 60))} h)
                            </Text>
                          )),
                        )}
                    </Stack>
                  </div>
                )}
                {liveResult.errors.length > 0 && (
                  <Alert color="red" title="Nerozpoznané řádky" variant="light">
                    <Stack gap={2}>
                      {liveResult.errors.map((e, i) => (
                        <Text size="xs" key={i}>
                          {e}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}
              </Stack>
            ) : (
              <Text c="dimmed" size="sm">
                Načítání…
              </Text>
            )}
          </Card>

          {workloadStats && <WorkloadCard stats={workloadStats} />}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
