import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Leaf, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — BK BUSINESS" },
      { name: "description", content: "Aceda à sua conta BK BUSINESS para gerir vendas, estoque e produção." },
      { property: "og:title", content: "Entrar — BK BUSINESS" },
      { property: "og:description", content: "Aceda à sua conta BK BUSINESS." },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.41 3.62v3h3.9c2.28-2.1 3.56-5.2 3.56-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.9-3c-1.08.73-2.46 1.16-4.05 1.16-3.11 0-5.75-2.1-6.69-4.92H1.28v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.31 14.32A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.58.38-2.32V6.59H1.28A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.28 5.41z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.6 4.6 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.59l4.03 3.09C6.25 6.87 8.89 4.77 12 4.77z"
      />
    </svg>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={show ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [role, setRole] = useState<"dono" | "funcionario">("dono");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else navigate({ to: "/" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName, business_name: businessName, role },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Conta criada! Já pode entrar.");
  }

  async function signInWithGoogle() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    setBusy(false);
    // Em sucesso o browser é redirecionado para o Google — não há mais nada a fazer aqui.
    if (error) toast.error(error.message);
  }

  async function sendPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setForgotBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setForgotBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Enviámos um email com o link para redefinir a palavra-passe.");
      setForgotOpen(false);
      setForgotEmail("");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="gradient-fresh hidden flex-col justify-between p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white/20">
            <Leaf className="size-6" />
          </span>
          <span className="text-lg font-bold tracking-tight">BK BUSINESS</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-4xl font-bold leading-tight">
            Gestão inteligente do seu negócio, do estoque ao balcão.
          </h1>
          <p className="text-primary-foreground/85">
            PDV rápido, controlo de matérias-primas, receitas de produção, clientes, dívidas e
            indicadores de lucro — tudo num só lugar.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/70">Produção · Estoque · PDV · Inteligência</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="gradient-fresh mb-3 flex size-11 items-center justify-center rounded-2xl text-primary-foreground">
              <Leaf className="size-6" />
            </span>
            <h1 className="text-2xl font-bold">BK BUSINESS</h1>
          </div>

          <Button
            type="button"
            variant="outline"
            className="mb-4 w-full gap-2"
            onClick={signInWithGoogle}
            disabled={busy}
          >
            <GoogleIcon />
            Continuar com Google
          </Button>

          <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="mb-6 grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Palavra-passe</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setForgotOpen(true);
                      }}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Esqueceu a palavra-passe?
                    </button>
                  </div>
                  <PasswordInput id="password" value={password} onChange={setPassword} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business">Nome do negócio</Label>
                  <Input
                    id="business"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de conta</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "dono", label: "Dono", hint: "Acesso total" },
                        { value: "funcionario", label: "Funcionário", hint: "Vendas e clientes" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRole(opt.value)}
                        className={
                          "rounded-lg border p-3 text-left text-sm transition-colors " +
                          (role === opt.value ? "border-primary bg-accent" : "hover:bg-muted")
                        }
                      >
                        <span className="block font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email2">Email</Label>
                  <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Palavra-passe</Label>
                  <PasswordInput id="password2" value={password} onChange={setPassword} minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar palavra-passe</DialogTitle>
          </DialogHeader>
          <form onSubmit={sendPasswordReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email da conta</Label>
              <Input
                id="forgot-email"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Vamos enviar um link para esse email para escolher uma nova palavra-passe.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={forgotBusy || !forgotEmail.trim()}>
                Enviar link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
