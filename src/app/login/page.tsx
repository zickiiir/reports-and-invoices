"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { signIn } from "next-auth/react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: { email: "", password: "" },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Zadejte platný e-mail"),
      password: (v) => (v.length > 0 ? null : "Zadejte heslo"),
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setError(
        result.code === "too_many_attempts"
          ? "Příliš mnoho pokusů o přihlášení. Zkuste to prosím za chvíli znovu."
          : "Nesprávný e-mail nebo heslo.",
      );
      return;
    }
    router.push(searchParams.get("callbackUrl") ?? "/");
    router.refresh();
  });

  return (
    <Paper withBorder shadow="sm" p="xl" radius="md" w={380}>
      <Stack gap="md">
        <div>
          <Title order={2}>Výkazy a faktury</Title>
          <Text c="dimmed" size="sm">
            Přihlaste se ke svému účtu dodavatele.
          </Text>
        </div>
        <form onSubmit={handleSubmit}>
          <Stack gap="sm">
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <TextInput
              label="E-mail"
              placeholder="vas@email.cz"
              required
              {...form.getInputProps("email")}
            />
            <PasswordInput
              label="Heslo"
              placeholder="Heslo"
              required
              {...form.getInputProps("password")}
            />
            <Button type="submit" loading={loading} fullWidth mt="sm">
              Přihlásit se
            </Button>
          </Stack>
        </form>
      </Stack>
    </Paper>
  );
}

export default function LoginPage() {
  return (
    <Center mih="100vh" bg="var(--mantine-color-body)">
      <Suspense>
        <LoginForm />
      </Suspense>
    </Center>
  );
}
