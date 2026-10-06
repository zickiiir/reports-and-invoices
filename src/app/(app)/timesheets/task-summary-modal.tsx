"use client";

import { Fragment, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  ScrollArea,
  type ScrollAreaAutosizeProps,
  SegmentedControl,
  Select,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconSearch } from "@tabler/icons-react";

import { formatHoursColon, type PersonTimesheet } from "~/server/timesheet/parse";
import {
  summarizeSubTasks,
  summarizeTasks,
  totalMinutesOfSubTasks,
  type TaskDetail,
} from "~/server/timesheet/tasks";

const ALL_ALIASES = "__all__";

/** A man-day (MD) as customers are usually billed — a fixed 8 h, deliberately not the
 * user's `hoursPerWorkday` (that's a personal workload goal, not a billing unit). */
const MINUTES_PER_MAN_DAY = 8 * 60;

function formatManDays(minutes: number): string {
  return (minutes / MINUTES_PER_MAN_DAY).toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type View = "tasks" | "subtasks";

function formatDateRange(first: string, last: string): string {
  return first === last
    ? dayjs(first).format("D. M.")
    : `${dayjs(first).format("D. M.")}–${dayjs(last).format("D. M.")}`;
}

/** Scrolls (wheel/trackpad/touch) without a visible scrollbar — the overlay scrollbar
 * would cover the hours/MD columns at the end of the table. */
function HiddenScrollArea(props: ScrollAreaAutosizeProps) {
  return <ScrollArea.Autosize {...props} type="never" />;
}

function ExpandIcon({ expandable, isOpen }: { expandable: boolean; isOpen: boolean }) {
  if (!expandable) return <span style={{ width: 18, flexShrink: 0 }} />;
  return (
    <ActionIcon size="xs" variant="subtle" color="gray">
      {isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
    </ActionIcon>
  );
}

function detailLabel(detail: TaskDetail): string {
  return detail.lines.length > 0 ? detail.lines.join(" · ") : "(bez upřesnění)";
}

/** Hours spent on each task (first description line of an entry), or on each
 * sub-line (typically a ticket) across tasks, in the viewed timesheet — computed from
 * the live (possibly unsaved) editor content. */
export function TaskSummaryModal({
  opened,
  onClose,
  title,
  perPerson,
  onJumpToLine,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  perPerson: PersonTimesheet[];
  /** Shows the given 1-based timesheet line in the editor (and closes the modal). */
  onJumpToLine: (line: number) => void;
}) {
  const [view, setView] = useState<View>("tasks");
  const [alias, setAlias] = useState(ALL_ALIASES);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tasks = useMemo(() => summarizeTasks(perPerson), [perPerson]);
  const subTasks = useMemo(() => summarizeSubTasks(perPerson), [perPerson]);
  const aliases = [...new Set(tasks.map((t) => t.alias))].sort();
  // The previously picked alias may disappear after editing the timesheet — fall back
  // to "all" instead of showing an empty table with a dangling filter.
  const effectiveAlias = aliases.includes(alias) ? alias : ALL_ALIASES;
  const showAlias = effectiveAlias === ALL_ALIASES;
  const needle = search.trim().toLocaleLowerCase("cs");
  const matches = (text: string) => text.toLocaleLowerCase("cs").includes(needle);
  const aliasMatches = (a: string) => showAlias || a === effectiveAlias;

  // A search hit in a sub-line narrows the task down to just the matching details
  // (and expands it), so the shown numbers answer "how much on #101".
  const visibleTasks = tasks
    .filter((t) => aliasMatches(t.alias))
    .flatMap((t) => {
      if (needle === "" || matches(t.task)) return [{ ...t, narrowed: false }];
      const details = t.details.filter((d) => d.lines.some(matches));
      if (details.length === 0) return [];
      return [
        {
          ...t,
          details,
          minutes: details.reduce((sum, d) => sum + d.minutes, 0),
          entries: details.reduce((sum, d) => sum + d.entries, 0),
          firstDate: details.map((d) => d.firstDate).sort()[0]!,
          lastDate: details.map((d) => d.lastDate).sort().at(-1)!,
          narrowed: true,
        },
      ];
    });
  const visibleSubTasks = subTasks.filter(
    (s) => aliasMatches(s.alias) && (needle === "" || matches(s.line)),
  );

  const rowCount = view === "tasks" ? visibleTasks.length : visibleSubTasks.length;
  const totalMinutes =
    view === "tasks"
      ? visibleTasks.reduce((sum, t) => sum + t.minutes, 0)
      : totalMinutesOfSubTasks(visibleSubTasks, perPerson);
  const columns = (showAlias ? 1 : 0) + 5;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    // returnFocus off: after "řádek N" the editor must keep the focus, not the
    // button that opened the modal.
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      // Still responsive: Mantine caps the modal content at `max-width: 100%`.
      size={1000}
      returnFocus={false}
      scrollAreaComponent={HiddenScrollArea}
    >
      <SegmentedControl
        mb="sm"
        fullWidth
        value={view}
        onChange={setView}
        data={[
          { value: "tasks", label: "Podle úkolů" },
          { value: "subtasks", label: "Podle podřádků (tiketů)" },
        ]}
      />
      <Group gap="sm" mb="sm" grow>
        <Select
          label="Odběratel"
          data={[
            { value: ALL_ALIASES, label: "Všichni" },
            ...aliases.map((a) => ({ value: a, label: a })),
          ]}
          allowDeselect={false}
          value={effectiveAlias}
          onChange={(v) => v && setAlias(v)}
        />
        <TextInput
          label={view === "tasks" ? "Hledat úkol nebo podřádek" : "Hledat podřádek"}
          placeholder="např. #101"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Group>

      {view === "subtasks" && visibleSubTasks.some((s) => s.shared.length > 0) && (
        <Alert color="orange" variant="light" mb="sm" p="xs">
          <Text size="xs">
            Některé záznamy mají víc podřádků najednou a z výkazu nejde poznat, kolik času
            připadá na který — do hodin proto započítané nejsou (oranžové „+ až …“). Pod
            šipkou najdeš, na kterém řádku výkazu jsou, a můžeš je rozdělit ručně.
          </Text>
        </Alert>
      )}

      {rowCount === 0 ? (
        <Text c="dimmed" size="sm">
          {view === "subtasks" && needle === ""
            ? "Ve výkazu nejsou žádné podřádky (řádky „-- …“ pod úkolem)."
            : "Nic nenalezeno."}
        </Text>
      ) : (
        <ScrollArea.Autosize mah="60vh" type="never">
          <Table striped highlightOnHover stickyHeader>
            <Table.Thead>
              <Table.Tr>
                {showAlias && <Table.Th>Odběratel</Table.Th>}
                <Table.Th>{view === "tasks" ? "Úkol" : "Podřádek"}</Table.Th>
                <Table.Th>Dny</Table.Th>
                <Table.Th ta="right">Záznamů</Table.Th>
                <Table.Th ta="right">Hodiny</Table.Th>
                <Table.Th ta="right">MD</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {view === "tasks"
                ? visibleTasks.map((t) => {
                    const key = `${t.alias}:${t.task}`;
                    const expandable =
                      t.details.length > 1 || (t.details[0]?.lines.length ?? 0) > 0;
                    const isOpen = expandable && (t.narrowed || expanded.has(key));
                    return (
                      <Fragment key={key}>
                        <Table.Tr
                          style={expandable ? { cursor: "pointer" } : undefined}
                          onClick={expandable ? () => toggle(key) : undefined}
                        >
                          {showAlias && <Table.Td>{t.alias}</Table.Td>}
                          <Table.Td>
                            <Group gap={4} wrap="nowrap">
                              <ExpandIcon expandable={expandable} isOpen={isOpen} />
                              <Text size="sm" fw={500}>
                                {t.task}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td style={{ whiteSpace: "nowrap" }}>
                            {formatDateRange(t.firstDate, t.lastDate)}
                          </Table.Td>
                          <Table.Td ta="right">{t.entries}</Table.Td>
                          <Table.Td ta="right" fw={500}>
                            {formatHoursColon(t.minutes)}
                          </Table.Td>
                          <Table.Td ta="right" fw={500}>
                            {formatManDays(t.minutes)}
                          </Table.Td>
                        </Table.Tr>
                        {isOpen &&
                          t.details.map((d) => (
                            <Table.Tr key={`${key}:${d.lines.join("\n")}`}>
                              {showAlias && <Table.Td />}
                              <Table.Td pl={40}>
                                <Text size="sm" c={d.lines.length ? undefined : "dimmed"}>
                                  {detailLabel(d)}
                                </Text>
                              </Table.Td>
                              <Table.Td style={{ whiteSpace: "nowrap" }}>
                                {formatDateRange(d.firstDate, d.lastDate)}
                              </Table.Td>
                              <Table.Td ta="right">{d.entries}</Table.Td>
                              <Table.Td ta="right">{formatHoursColon(d.minutes)}</Table.Td>
                              <Table.Td ta="right">{formatManDays(d.minutes)}</Table.Td>
                            </Table.Tr>
                          ))}
                      </Fragment>
                    );
                  })
                : visibleSubTasks.map((s) => {
                    const key = `sub:${s.alias}:${s.line}`;
                    const sharedMinutes = s.shared.reduce((sum, e) => sum + e.minutes, 0);
                    const expandable = s.shared.length > 0;
                    const isOpen = expandable && expanded.has(key);
                    return (
                      <Fragment key={key}>
                        <Table.Tr
                          style={expandable ? { cursor: "pointer" } : undefined}
                          onClick={expandable ? () => toggle(key) : undefined}
                        >
                          {showAlias && <Table.Td>{s.alias}</Table.Td>}
                          <Table.Td>
                            <Group gap={4} wrap="nowrap" align="flex-start">
                              <ExpandIcon expandable={expandable} isOpen={isOpen} />
                              <div>
                                <Text size="sm" fw={500}>
                                  {s.line}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {s.tasks.join(", ")}
                                </Text>
                              </div>
                            </Group>
                          </Table.Td>
                          <Table.Td style={{ whiteSpace: "nowrap" }}>
                            {formatDateRange(s.firstDate, s.lastDate)}
                          </Table.Td>
                          <Table.Td ta="right">{s.entries}</Table.Td>
                          <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                            <Text size="sm" fw={500}>
                              {formatHoursColon(s.minutes)}
                            </Text>
                            {expandable && (
                              <Text size="xs" c="orange">
                                + až {formatHoursColon(sharedMinutes)} nejasně
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                            <Text size="sm" fw={500}>
                              {formatManDays(s.minutes)}
                            </Text>
                            {expandable && (
                              <Text size="xs" c="orange">
                                + až {formatManDays(sharedMinutes)}
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                        {isOpen &&
                          s.shared.map((e) => (
                            <Table.Tr key={`${key}:${e.line}`}>
                              {showAlias && <Table.Td />}
                              <Table.Td pl={40}>
                                <Group gap="xs" wrap="nowrap">
                                  <Button
                                    size="compact-xs"
                                    variant="light"
                                    color="orange"
                                    onClick={() => onJumpToLine(e.line)}
                                  >
                                    řádek {e.line}
                                  </Button>
                                  <Text size="xs" c="dimmed">
                                    spolu s {e.otherLines.join(", ")}
                                  </Text>
                                </Group>
                              </Table.Td>
                              <Table.Td style={{ whiteSpace: "nowrap" }}>
                                {dayjs(e.date).format("D. M.")}
                              </Table.Td>
                              <Table.Td />
                              <Table.Td ta="right">
                                <Text size="sm" c="orange">
                                  {formatHoursColon(e.minutes)}
                                </Text>
                              </Table.Td>
                              <Table.Td ta="right">
                                <Text size="sm" c="orange">
                                  {formatManDays(e.minutes)}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                      </Fragment>
                    );
                  })}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr
                style={{ borderTop: "2px solid var(--mantine-color-default-border)" }}
              >
                <Table.Th colSpan={columns - 2}>
                  Celkem ({rowCount} {view === "tasks" ? "úkolů" : "podřádků"})
                </Table.Th>
                <Table.Th ta="right">{formatHoursColon(totalMinutes)}</Table.Th>
                <Table.Th ta="right">{formatManDays(totalMinutes)}</Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </ScrollArea.Autosize>
      )}
    </Modal>
  );
}
