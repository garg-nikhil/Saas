import { CheckCircle2Icon, XCircleIcon } from "./Icons";

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordStrength {
  score: number; // 0 to 4
  level: "very-weak" | "weak" | "medium" | "strong" | "very-strong";
  label: string;
  color: string;
  bgColor: string;
  rules: PasswordRule[];
  isSecure: boolean;
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  const hasMinLength = password.length >= 8;
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const rules: PasswordRule[] = [
    { id: "length", label: "Au moins 8 caractères", met: hasMinLength },
    { id: "case", label: "Majuscules et minuscules (a-z, A-Z)", met: hasMixedCase },
    { id: "number", label: "Au moins un chiffre (0-9)", met: hasNumber },
    { id: "special", label: "Au moins un caractère spécial (!@#$..)", met: hasSpecial },
  ];

  const metCount = rules.filter((r) => r.met).length;

  let score = 0;
  let level: PasswordStrength["level"] = "very-weak";
  let label = "Très faible";
  let color = "#ef4444"; // red
  let bgColor = "#fee2e2";

  if (password.length === 0) {
    score = 0;
    label = "Non renseigné";
    color = "#94a3b8";
    bgColor = "#f1f5f9";
  } else if (metCount === 1) {
    score = 1;
    level = "weak";
    label = "Faible";
    color = "#f97316"; // orange
    bgColor = "#ffedd5";
  } else if (metCount === 2 || (metCount === 3 && password.length < 8)) {
    score = 2;
    level = "medium";
    label = "Moyen";
    color = "#eab308"; // yellow
    bgColor = "#fef9c3";
  } else if (metCount === 3) {
    score = 3;
    level = "strong";
    label = "Fort";
    color = "#10b981"; // emerald
    bgColor = "#d1fae5";
  } else if (metCount === 4 && password.length >= 10) {
    score = 4;
    level = "very-strong";
    label = "Très sécurisé";
    color = "#059669"; // dark green
    bgColor = "#a7f3d0";
  } else {
    score = 3;
    level = "strong";
    label = "Fort";
    color = "#10b981";
    bgColor = "#d1fae5";
  }

  const isSecure = hasMinLength && metCount >= 2;

  return {
    score,
    level,
    label,
    color,
    bgColor,
    rules,
    isSecure,
  };
}

export function PasswordStrengthMeter({
  password,
  showRules = true,
}: {
  password: string;
  showRules?: boolean;
}) {
  if (!password) return null;

  const strength = calculatePasswordStrength(password);

  return (
    <div
      id="password-strength-container"
      style={{
        marginTop: "0.5rem",
        marginBottom: "0.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
      }}
    >
      {/* Strength indicator bars */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          width: "100%",
        }}
        aria-label={`Niveau de sécurité du mot de passe: ${strength.label}`}
        role="progressbar"
        aria-valuenow={strength.score}
        aria-valuemin={0}
        aria-valuemax={4}
      >
        {[1, 2, 3, 4].map((step) => {
          const isActive = strength.score >= step;
          return (
            <div
              key={step}
              style={{
                flex: 1,
                height: "5px",
                borderRadius: "9999px",
                backgroundColor: isActive ? strength.color : "#e2e8f0",
                transition: "background-color 0.2s ease",
              }}
            />
          );
        })}
      </div>

      {/* Strength label badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.75rem",
        }}
      >
        <span style={{ color: "#64748b" }}>Force du mot de passe :</span>
        <span
          style={{
            fontWeight: 600,
            color: strength.color,
          }}
        >
          {strength.label}
        </span>
      </div>

      {/* Rules list */}
      {showRules && (
        <div
          id="password-strength-rules"
          style={{
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            marginTop: "0.25rem",
          }}
        >
          {strength.rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                color: rule.met ? "#059669" : "#64748b",
                transition: "color 0.15s ease",
              }}
            >
              {rule.met ? (
                <CheckCircle2Icon size={13} color="#059669" />
              ) : (
                <XCircleIcon size={13} color="#94a3b8" />
              )}
              <span>{rule.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
