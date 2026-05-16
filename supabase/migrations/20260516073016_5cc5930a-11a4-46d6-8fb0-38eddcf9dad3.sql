CREATE POLICY "Host or invitee deletes invite" ON public.stream_collab_invites
  FOR DELETE USING (auth.uid() = host_id OR auth.uid() = invitee_id);