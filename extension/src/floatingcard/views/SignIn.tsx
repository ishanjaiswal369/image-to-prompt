import { useSignIn } from "../api/hooks.js";
import { BrandMark } from "../components/Icons.js";

export function SignIn() {
  const signIn = useSignIn();

  return (
    <div className="signin-view">
      <BrandMark size={34} className="signin-mark" />
      <div>
        <div className="signin-title">Image to Prompt</div>
        <p className="signin-body">Sign in to analyze images and keep track of your credit balance.</p>
      </div>
      <button className="google-btn" onClick={() => signIn.mutate()} disabled={signIn.isPending}>
        {signIn.isPending ? "Signing in…" : "Continue with Google"}
      </button>
      {signIn.isError && <p className="error-text">{(signIn.error as Error).message}</p>}
    </div>
  );
}
