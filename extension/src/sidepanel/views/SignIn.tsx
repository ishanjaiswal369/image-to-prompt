import { useSignIn } from "../api/hooks.js";

export function SignIn() {
  const signIn = useSignIn();

  return (
    <div className="view view-signin">
      <h1>Image to Prompt</h1>
      <p>Sign in with Google to analyze images and track your credit balance.</p>
      <button onClick={() => signIn.mutate()} disabled={signIn.isPending}>
        {signIn.isPending ? "Signing in…" : "Sign in with Google"}
      </button>
      {signIn.isError && <p className="error-text">{(signIn.error as Error).message}</p>}
    </div>
  );
}
