import { useState } from "react";
import { readToken, writeToken } from "../api/client";

/**
 * The credential input.
 *
 * The token goes to sessionStorage and nowhere else: not localStorage, not a
 * query parameter, not a permalink. Saving reloads the page rather than trying
 * to invalidate every cached query — a token change is a change of identity,
 * and starting clean is both simpler and more obviously correct.
 */
export function TokenBar() {
  const [token, setToken] = useState(readToken);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="d-flex align-items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        writeToken(token.trim());
        setSaved(true);
        window.location.reload();
      }}
    >
      <label className="form-label mb-0 small text-body-secondary" htmlFor="token">
        token
      </label>
      <input
        id="token"
        type="password"
        className="form-control form-control-sm"
        style={{ width: 220 }}
        placeholder="bearer token (blank for public drops)"
        autoComplete="off"
        value={token}
        onChange={(event) => {
          setToken(event.target.value);
          setSaved(false);
        }}
      />
      <button className="btn btn-sm btn-outline-secondary" type="submit" disabled={saved}>
        {saved ? "saved" : "save"}
      </button>
    </form>
  );
}
