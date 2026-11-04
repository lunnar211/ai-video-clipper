export default function Copyright() {
  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Copyright / DMCA
      </h1>
      <p>
        AI Video Clipper is a tool for clipping videos you own. It does
        not host user videos, and it contains no feature designed to
        evade copyright detection.
      </p>
      <h2 className="text-lg font-semibold text-foreground">
        If your work was used without permission
      </h2>
      <p>
        File a notice with the Report page form (or, if the form is
        not connected yet, send a notice to the contact address on the
        Contact page, currently a placeholder the owner must replace)
        with:
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Identification of the copyrighted work you claim was infringed.</li>
        <li>
          Identification of the clip or material you claim is infringing,
          with enough detail to locate it (platform, post link, date).
        </li>
        <li>
          Your name, address, telephone number and email address.
        </li>
        <li>
          A statement that you have a good-faith belief the use is not
          authorised by the copyright owner, its agent, or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the information in
          your notice is accurate and that you are the copyright owner
          or authorised to act on their behalf.
        </li>
        <li>Your physical or electronic signature.</li>
      </ol>
      <h2 className="text-lg font-semibold text-foreground">
        What happens next
      </h2>
      <p>
        Valid notices enter the admin review queue and move submitted
        → under review → upheld or overturned. On a confirmed
        infringement the owner will act — including disabling the
        relevant account or feature where applicable — and will notify
        the affected user where contact details exist. Appeals are
        filed from the Report page and follow the same review path: an
        upheld appeal means the strike stands; an overturned appeal
        reverses it and recomputes any publishing pause it caused.
      </p>
      <h2 className="text-lg font-semibold text-foreground">
        Repeat infringers
      </h2>
      <p>
        Accounts that repeatedly clip or publish material they do not
        own are handled by a fixed policy, also enforced in code: 2
        upheld strikes flag an account for admin review, and 3 upheld
        strikes automatically pause its publishing until an admin
        reviews it. A pause is recomputed whenever a strike is upheld
        or overturned, so reversing a strike can lift a pause. Nothing
        here promises any outcome for any individual case.
      </p>
    </div>
  );
}
